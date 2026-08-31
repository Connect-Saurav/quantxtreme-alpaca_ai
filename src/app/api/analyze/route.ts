/**
 * POST /api/analyze
 * Runs the full pipeline: research agents -> debate -> risk governor.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAllAgents } from "@/lib/agents/research";
import { runDebateAgent } from "@/lib/agents/debate";
import { evaluateProposal } from "@/lib/risk/governor";
import { db } from "@/lib/db";
import { getQuote } from "@/lib/alpaca/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = String(body?.symbol || "").toUpperCase().trim();
    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    const analysis = await runAllAgents(symbol);
    const proposal = await runDebateAgent(analysis);

    const analysisRow = await db.analysis.create({
      data: {
        symbol: analysis.symbol,
        technical: JSON.stringify(analysis.technical),
        fundamental: JSON.stringify(analysis.fundamental),
        sentiment: JSON.stringify(analysis.sentiment),
        macro: JSON.stringify(analysis.macro),
        thesis: proposal.thesis,
        direction: proposal.direction,
        confidence: proposal.confidence,
        expectedReturn: proposal.expectedReturn,
        stopLoss: proposal.stopLoss,
        timeHorizon: proposal.timeHorizon,
      },
    });

    const riskDecision = await evaluateProposal(proposal);

    let counterfactual = null;
    if (riskDecision.decision === "REJECT") {
      const quote = await getQuote(symbol);
      const failedRule = riskDecision.rules.find((r) => !r.passed);
      counterfactual = await db.counterfactual.create({
        data: {
          analysisId: analysisRow.id,
          symbol,
          direction: proposal.direction,
          thesis: proposal.thesis,
          confidence: proposal.confidence,
          expectedReturn: proposal.expectedReturn,
          rejectionRule: failedRule?.rule || "unknown",
          rejectionReason: riskDecision.reason,
          priceAtRejection: quote?.price ?? proposal.price,
        },
      });
    }

    return NextResponse.json({
      analysisId: analysisRow.id,
      analysis,
      proposal,
      riskDecision,
      counterfactualId: counterfactual?.id ?? null,
    });
  } catch (e: any) {
    console.error("/api/analyze error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
