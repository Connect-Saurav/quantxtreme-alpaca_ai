/**
 * Risk Governor — DETERMINISTIC risk engine.
 *
 * AI proposes. Rules verify. Alpaca executes.
 *
 * The Risk Governor receives a TradeProposal and returns either APPROVED
 * (with adjusted position size) or REJECTED (with the specific rule that
 * triggered rejection).
 *
 * Rules (configurable via RiskConfig in DB, with sensible defaults):
 *   - maxPositionSize     — single position cannot exceed X% of portfolio
 *   - maxSectorExposure   — sector exposure cannot exceed X%
 *   - maxTotalExposure    — total long+short exposure cannot exceed X%
 *   - minConfidence       — confidence must be at least X (0..1)
 *   - maxDrawdown         — if portfolio is down more than X% from peak, halt
 *   - minExpectedReturn   — expected return must be at least X (decimal)
 */

import { db } from "@/lib/db";
import { getAccount, getPositions, getSectorMap } from "@/lib/alpaca/client";
import type { TradeProposal } from "@/lib/agents/debate";

export interface RiskDecision {
  decision: "APPROVE" | "REJECT";
  proposal: TradeProposal;
  rules: RuleCheck[];
  positionSize?: number;       // shares
  positionValueUsd?: number;   // dollars
  positionSizePct?: number;    // % of portfolio
  reason: string;
}

export interface RuleCheck {
  rule: string;
  passed: boolean;
  detail: string;
  threshold?: number;
  observed?: number;
}

const DEFAULT_CONFIG = {
  maxPositionSize: 10.0,
  maxSectorExposure: 35.0,
  maxTotalExposure: 80.0,
  minConfidence: 0.65,
  maxDrawdown: 15.0,
  minExpectedReturn: 0.02,
  startingCapital: 100000,
};

async function getConfig() {
  let cfg = await db.riskConfig.findUnique({ where: { id: "default" } });
  if (!cfg) {
    cfg = await db.riskConfig.create({ data: { id: "default", ...DEFAULT_CONFIG } });
  }
  return cfg;
}

export async function evaluateProposal(proposal: TradeProposal): Promise<RiskDecision> {
  const cfg = await getConfig();
  const sectorMap = getSectorMap();
  const sector = sectorMap[proposal.symbol] ?? "Unknown";

  const [account, positions] = await Promise.all([getAccount(), getPositions()]);

  // Current portfolio state
  const equity = account.equity || cfg.startingCapital;
  const peak = Math.max(equity, cfg.startingCapital);
  const drawdownPct = ((peak - equity) / peak) * 100;

  // Total exposure
  const totalExposure =
    positions.reduce((s, p) => s + Math.abs(p.marketValue), 0);
  const totalExposurePct = (totalExposure / equity) * 100;

  // Sector exposure
  const sectorExposure = positions
    .filter((p) => sectorMap[p.symbol] === sector)
    .reduce((s, p) => s + Math.abs(p.marketValue), 0);
  const sectorExposurePct = (sectorExposure / equity) * 100;

  // Existing position in this symbol
  const existing = positions.find((p) => p.symbol === proposal.symbol);

  // Proposed position value (rule: cap at maxPositionSize% of equity)
  const maxPositionValueUsd = (cfg.maxPositionSize / 100) * equity;
  // Kelly-lite sizing: scale by confidence and expected return
  const kelly = Math.min(
    1,
    Math.max(0, proposal.confidence * proposal.expectedReturn / Math.max(0.01, proposal.stopLoss))
  );
  const rawPositionValueUsd = maxPositionValueUsd * Math.min(1, kelly * 2);
  const positionValueUsd = Number(Math.min(maxPositionValueUsd, rawPositionValueUsd).toFixed(2));
  const positionSize = Math.max(0, Math.floor(positionValueUsd / Math.max(0.01, proposal.price)));
  const positionSizePct = (positionValueUsd / equity) * 100;

  // ---- Run all rules ----
  const rules: RuleCheck[] = [];

  // Rule 1: minimum confidence
  rules.push({
    rule: "min_confidence",
    passed: proposal.confidence >= cfg.minConfidence,
    detail: `Proposal confidence ${(proposal.confidence * 100).toFixed(1)}% vs required ${(cfg.minConfidence * 100).toFixed(0)}%`,
    threshold: cfg.minConfidence,
    observed: proposal.confidence,
  });

  // Rule 2: minimum expected return
  rules.push({
    rule: "min_expected_return",
    passed: proposal.expectedReturn >= cfg.minExpectedReturn,
    detail: `Expected return ${(proposal.expectedReturn * 100).toFixed(2)}% vs required ${(cfg.minExpectedReturn * 100).toFixed(1)}%`,
    threshold: cfg.minExpectedReturn,
    observed: proposal.expectedReturn,
  });

  // Rule 3: max drawdown circuit breaker
  rules.push({
    rule: "max_drawdown",
    passed: drawdownPct <= cfg.maxDrawdown,
    detail: `Current drawdown ${drawdownPct.toFixed(2)}% vs limit ${cfg.maxDrawdown.toFixed(0)}%`,
    threshold: cfg.maxDrawdown,
    observed: drawdownPct,
  });

  // Rule 4: position size cap
  rules.push({
    rule: "max_position_size",
    passed: positionSizePct <= cfg.maxPositionSize,
    detail: `Position size ${positionSizePct.toFixed(2)}% vs cap ${cfg.maxPositionSize}%`,
    threshold: cfg.maxPositionSize,
    observed: positionSizePct,
  });

  // Rule 5: sector exposure cap (after proposed position)
  const newSectorExposurePct = sectorExposurePct + positionSizePct;
  rules.push({
    rule: "max_sector_exposure",
    passed: newSectorExposurePct <= cfg.maxSectorExposure,
    detail: `Sector (${sector}) exposure would be ${newSectorExposurePct.toFixed(2)}% vs cap ${cfg.maxSectorExposure}%`,
    threshold: cfg.maxSectorExposure,
    observed: newSectorExposurePct,
  });

  // Rule 6: total exposure cap (after proposed position)
  const newTotalExposurePct = totalExposurePct + positionSizePct;
  rules.push({
    rule: "max_total_exposure",
    passed: newTotalExposurePct <= cfg.maxTotalExposure,
    detail: `Total exposure would be ${newTotalExposurePct.toFixed(2)}% vs cap ${cfg.maxTotalExposure}%`,
    threshold: cfg.maxTotalExposure,
    observed: newTotalExposurePct,
  });

  // Rule 7: direction consistency (only trade if direction != NEUTRAL)
  rules.push({
    rule: "direction_valid",
    passed: proposal.direction !== "NEUTRAL",
    detail: `Direction is ${proposal.direction} (NEUTRAL is non-tradable)`,
  });

  // Rule 8: no doubling up on existing position beyond cap
  const existingValue = existing?.marketValue ?? 0;
  const existingPct = (existingValue / equity) * 100;
  rules.push({
    rule: "existing_position_cap",
    passed: existingPct + positionSizePct <= cfg.maxPositionSize * 1.5,
    detail: `Existing position ${existingPct.toFixed(2)}% + new ${positionSizePct.toFixed(2)}% vs combined cap ${(cfg.maxPositionSize * 1.5).toFixed(1)}%`,
    threshold: cfg.maxPositionSize * 1.5,
    observed: existingPct + positionSizePct,
  });

  // ---- Decision ----
  const failed = rules.filter((r) => !r.passed);
  const approved = failed.length === 0 && positionSize > 0;

  if (approved) {
    return {
      decision: "APPROVE",
      proposal,
      rules,
      positionSize,
      positionValueUsd,
      positionSizePct,
      reason: `APPROVED — position size ${positionSize} shares ($${positionValueUsd.toFixed(2)}, ${positionSizePct.toFixed(2)}% of equity). All ${rules.length} rules passed.`,
    };
  }

  // Rejected — pick the most actionable reason
  const primary = failed[0];
  const reasonMap: Record<string, string> = {
    min_confidence: `Confidence ${(proposal.confidence * 100).toFixed(0)}% below threshold`,
    min_expected_return: `Expected return ${(proposal.expectedReturn * 100).toFixed(1)}% below minimum`,
    max_drawdown: `Portfolio drawdown exceeded — risk-off mode`,
    max_position_size: `Position would exceed single-position size cap`,
    max_sector_exposure: `${sector} sector exposure would exceed limit`,
    max_total_exposure: `Total portfolio exposure would exceed limit`,
    direction_valid: `Direction is NEUTRAL — no trade thesis`,
    existing_position_cap: `Existing position too large to add`,
  };

  return {
    decision: "REJECT",
    proposal,
    rules,
    reason: `REJECTED — ${reasonMap[primary.rule] || primary.detail}`,
  };
}

export async function updateRiskConfig(patch: Partial<typeof DEFAULT_CONFIG>) {
  const cfg = await db.riskConfig.upsert({
    where: { id: "default" },
    update: patch,
    create: { id: "default", ...DEFAULT_CONFIG, ...patch },
  });
  return cfg;
}

export async function getRiskConfig() {
  let cfg = await db.riskConfig.findUnique({ where: { id: "default" } });
  if (!cfg) {
    cfg = await db.riskConfig.create({ data: { id: "default", ...DEFAULT_CONFIG } });
  }
  return cfg;
}
