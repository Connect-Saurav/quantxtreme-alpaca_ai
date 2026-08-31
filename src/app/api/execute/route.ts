/**
 * POST /api/execute
 * Executes an approved proposal via Alpaca (paper / live) and opens a trade
 * in the journal.
 *
 * Body: { analysisId?: string, proposal: TradeProposal, positionSize?: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { placeOrder } from "@/lib/alpaca/client";
import { createTrade } from "@/lib/journal/service";
import type { TradeProposal } from "@/lib/agents/debate";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const proposal = body.proposal as TradeProposal;
    const analysisId = body.analysisId as string | undefined;
    const positionSize = Number(body.positionSize) || 0;

    if (!proposal || !proposal.symbol || !proposal.direction) {
      return NextResponse.json({ error: "proposal is required" }, { status: 400 });
    }

    if (proposal.direction === "NEUTRAL") {
      return NextResponse.json({ error: "Cannot execute NEUTRAL" }, { status: 400 });
    }

    const side = proposal.direction === "LONG" ? "buy" : "sell";
    if (positionSize <= 0) {
      return NextResponse.json({ error: "positionSize must be > 0" }, { status: 400 });
    }

    const order = await placeOrder(proposal.symbol, positionSize, side);
    if (order.status !== "filled") {
      return NextResponse.json({ error: "Order not filled", order }, { status: 500 });
    }

    const signals = ["technical", "fundamental", "sentiment", "macro"];
    const trade = await createTrade({
      analysisId,
      proposal,
      signalsUsed: signals,
      entryPrice: order.filledPrice,
      quantity: positionSize,
    });

    return NextResponse.json({ order, trade });
  } catch (e: any) {
    console.error("/api/execute error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
