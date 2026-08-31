/**
 * Trade Journal — Post-trade learning engine.
 *
 * For every trade we persist the full pipeline:
 *   THESIS → SIGNALS USED → DECISION → EXECUTION → POSITION → OUTCOME →
 *   THESIS CORRECT? → LESSON
 *
 * After trades are closed we aggregate statistics (win rate by signal type,
 * Sharpe by confidence bucket, etc.).
 */

import { db } from "@/lib/db";
import { getQuote } from "@/lib/alpaca/client";
import type { TradeProposal } from "@/lib/agents/debate";

export interface Stats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winRate: number;          // 0..1
  avgReturnPct: number;     // decimal
  sharpeOverall: number;
  totalPnlUsd: number;
  bySignal: {
    signal: string;
    trades: number;
    winRate: number;
    avgReturn: number;
    sharpe: number;
  }[];
  byConfidence: {
    bucket: string;
    trades: number;
    winRate: number;
    avgReturn: number;
    sharpe: number;
  }[];
  bySector: {
    sector: string;
    trades: number;
    winRate: number;
    avgReturn: number;
  }[];
}

export interface CreateTradeInput {
  analysisId?: string;
  proposal: TradeProposal;
  signalsUsed: string[];
  entryPrice: number;
  quantity: number;
}

export async function createTrade(input: CreateTradeInput) {
  const trade = await db.trade.create({
    data: {
      analysisId: input.analysisId,
      symbol: input.proposal.symbol,
      direction: input.proposal.direction,
      thesis: input.proposal.thesis,
      confidence: input.proposal.confidence,
      expectedReturn: input.proposal.expectedReturn,
      stopLoss: input.proposal.stopLoss,
      timeHorizon: input.proposal.timeHorizon,
      signalsUsed: JSON.stringify(input.signalsUsed),
      entryPrice: input.entryPrice,
      quantity: input.quantity,
      status: "OPEN",
    },
  });
  return trade;
}

export async function closeTrade(
  tradeId: string,
  reason: "take_profit" | "stop_loss" | "time_exit" | "manual"
) {
  const trade = await db.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error("Trade not found");
  if (trade.status === "CLOSED") return trade;

  const quote = await getQuote(trade.symbol);
  const exitPrice = quote?.price ?? trade.entryPrice;

  // Outcome: long profits when exit > entry; short profits when exit < entry
  const pctMove = (exitPrice - trade.entryPrice) / trade.entryPrice;
  const outcome =
    trade.direction === "LONG" ? pctMove : trade.direction === "SHORT" ? -pctMove : 0;

  // Thesis was right if outcome matches the directional bet AND exceeds expected return * 0.5
  const thesisCorrect =
    (trade.direction === "LONG" && outcome > trade.expectedReturn * 0.5) ||
    (trade.direction === "SHORT" && outcome > trade.expectedReturn * 0.5);

  // Generate lesson via simple rule-based heuristics (LLM could enhance this)
  const signals = JSON.parse(trade.signalsUsed) as string[];
  const winningSignals = signals.filter((s) =>
    s.toLowerCase().includes("technical") || s.toLowerCase().includes("sentiment")
  );
  const lesson = generateLesson(trade, outcome, thesisCorrect, signals);

  const closed = await db.trade.update({
    where: { id: tradeId },
    data: {
      status: "CLOSED",
      exitPrice,
      exitAt: new Date(),
      outcome: Number(outcome.toFixed(4)),
      thesisCorrect,
      lesson,
      closedReason: reason,
    },
  });
  return closed;
}

function generateLesson(
  trade: { symbol: string; direction: string; thesis: string; confidence: number; expectedReturn: number; stopLoss: number; signalsUsed: string },
  outcome: number,
  thesisCorrect: boolean,
  signals: string[]
): string {
  if (thesisCorrect) {
    return `WIN on ${trade.symbol} (${trade.direction}). Outcome ${(outcome * 100).toFixed(2)}% exceeded expected ${(trade.expectedReturn * 100).toFixed(2)}%. Signals ${signals.join(", ")} aligned. Reinforce this signal combination.`;
  }
  if (Math.abs(outcome) < trade.stopLoss * 0.5) {
    return `FLAT on ${trade.symbol} — thesis wrong but stopped before major loss. Outcome ${(outcome * 100).toFixed(2)}%. Review whether ${signals.join(", ")} were noise.`;
  }
  return `LOSS on ${trade.symbol} (${trade.direction}). Outcome ${(outcome * 100).toFixed(2)}% vs expected ${(trade.expectedReturn * 100).toFixed(2)}%. Thesis was incorrect — review whether ${signals.join(", ")} produced a false signal. Consider tightening stop-loss.`;
}

// ---------------------------------------------------------------------------
// Statistics — post-trade learning insights
// ---------------------------------------------------------------------------

export async function computeStats(): Promise<Stats> {
  const trades = await db.trade.findMany({ orderBy: { entryAt: "desc" } });
  const closed = trades.filter((t) => t.status === "CLOSED" && t.outcome !== null);
  const open = trades.filter((t) => t.status === "OPEN");

  if (closed.length === 0) {
    return {
      totalTrades: trades.length,
      openTrades: open.length,
      closedTrades: 0,
      winRate: 0,
      avgReturnPct: 0,
      sharpeOverall: 0,
      totalPnlUsd: 0,
      bySignal: [],
      byConfidence: [],
      bySector: [],
    };
  }

  const wins = closed.filter((t) => (t.outcome ?? 0) > 0);
  const winRate = wins.length / closed.length;
  const avgReturn = closed.reduce((s, t) => s + (t.outcome ?? 0), 0) / closed.length;

  // Sharpe (rough): mean / std of outcomes (no annualization — sample Sharpe)
  const mean = avgReturn;
  const variance =
    closed.reduce((s, t) => s + Math.pow((t.outcome ?? 0) - mean, 2), 0) / closed.length;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? mean / std : 0;

  // PnL in USD (rough)
  const totalPnlUsd = closed.reduce(
    (s, t) => s + (t.outcome ?? 0) * t.entryPrice * t.quantity,
    0
  );

  // By signal: each trade may have multiple signals; count each
  const signalMap: Record<string, number[]> = {};
  closed.forEach((t) => {
    const signals = JSON.parse(t.signalsUsed) as string[];
    signals.forEach((s) => {
      if (!signalMap[s]) signalMap[s] = [];
      signalMap[s].push(t.outcome ?? 0);
    });
  });

  const bySignal = Object.entries(signalMap).map(([signal, outcomes]) => {
    const n = outcomes.length;
    const m = outcomes.reduce((a, b) => a + b, 0) / n;
    const v = outcomes.reduce((a, b) => a + Math.pow(b - m, 2), 0) / n;
    const sd = Math.sqrt(v);
    return {
      signal,
      trades: n,
      winRate: outcomes.filter((o) => o > 0).length / n,
      avgReturn: Number(m.toFixed(4)),
      sharpe: sd > 0 ? Number((m / sd).toFixed(2)) : 0,
    };
  }).sort((a, b) => b.trades - a.trades);

  // By confidence bucket
  const buckets = [
    { bucket: "High (>=0.75)", min: 0.75, max: 1.01 },
    { bucket: "Medium (0.6-0.75)", min: 0.6, max: 0.75 },
    { bucket: "Low (<0.6)", min: 0, max: 0.6 },
  ];
  const byConfidence = buckets.map(({ bucket, min, max }) => {
    const subset = closed.filter((t) => t.confidence >= min && t.confidence < max);
    if (subset.length === 0) return { bucket, trades: 0, winRate: 0, avgReturn: 0, sharpe: 0 };
    const outcomes = subset.map((t) => t.outcome ?? 0);
    const m = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
    const v = outcomes.reduce((a, b) => a + Math.pow(b - m, 2), 0) / outcomes.length;
    const sd = Math.sqrt(v);
    return {
      bucket,
      trades: subset.length,
      winRate: outcomes.filter((o) => o > 0).length / outcomes.length,
      avgReturn: Number(m.toFixed(4)),
      sharpe: sd > 0 ? Number((m / sd).toFixed(2)) : 0,
    };
  });

  // By sector
  const sectorMap = getSectorLookup();
  const sectorBuckets: Record<string, number[]> = {};
  closed.forEach((t) => {
    const sector = sectorMap[t.symbol] ?? "Unknown";
    if (!sectorBuckets[sector]) sectorBuckets[sector] = [];
    sectorBuckets[sector].push(t.outcome ?? 0);
  });
  const bySector = Object.entries(sectorBuckets).map(([sector, outcomes]) => {
    const n = outcomes.length;
    const m = outcomes.reduce((a, b) => a + b, 0) / n;
    return {
      sector,
      trades: n,
      winRate: outcomes.filter((o) => o > 0).length / n,
      avgReturn: Number(m.toFixed(4)),
    };
  }).sort((a, b) => b.trades - a.trades);

  return {
    totalTrades: trades.length,
    openTrades: open.length,
    closedTrades: closed.length,
    winRate: Number(winRate.toFixed(4)),
    avgReturnPct: Number(avgReturn.toFixed(4)),
    sharpeOverall: Number(sharpe.toFixed(2)),
    totalPnlUsd: Number(totalPnlUsd.toFixed(2)),
    bySignal,
    byConfidence,
    bySector,
  };
}

function getSectorLookup(): Record<string, string> {
  // Mirror of SEED_PRICES sector map
  return {
    NVDA: "Technology",
    AAPL: "Technology",
    MSFT: "Technology",
    META: "Technology",
    GOOGL: "Technology",
    AMD: "Technology",
    TSLA: "Automotive",
    AMZN: "Consumer",
    JPM: "Financials",
    XOM: "Energy",
  };
}
