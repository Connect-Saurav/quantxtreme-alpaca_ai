/**
 * POST /api/run-batch
 * Runs the analyze pipeline across multiple symbols (or the full universe).
 * Body: { symbols?: string[] }  (default: full universe)
 *
 * Used to populate the counterfactual + trade journal quickly for demo.
 */

import { NextRequest, NextResponse } from "next/server";
import { listUniverse } from "@/lib/alpaca/client";
import { runAllAgents } from "@/lib/agents/research";
import { runDebateAgent } from "@/lib/agents/debate";
import { evaluateProposal } from "@/lib/risk/governor";
import { db } from "@/lib/db";
import { getQuote } from "@/lib/alpaca/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbols =
      Array.isArray(body?.symbols) && body.symbols.length > 0
        ? body.symbols.map((s: string) => String(s).toUpperCase())
        : listUniverse().map((u) => u.ticker);

    const results: any[] = [];

    for (const symbol of symbols) {
      try {
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

        if (riskDecision.decision === "REJECT") {
          const quote = await getQuote(symbol);
          const failedRule = riskDecision.rules.find((r) => !r.passed);
          await db.counterfactual.create({
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

        results.push({
          symbol,
          direction: proposal.direction,
          confidence: proposal.confidence,
          decision: riskDecision.decision,
          reason: riskDecision.reason,
        });
      } catch (err: any) {
        results.push({ symbol, error: err?.message || "failed" });
      }
    }

    return NextResponse.json({ results });
  } catch (e: any) {
    console.error("/api/run-batch error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
