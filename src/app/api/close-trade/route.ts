/**
 * POST /api/close-trade
 * Body: { id: string, reason?: "take_profit"|"stop_loss"|"time_exit"|"manual" }
 * Closes an open trade at current market price, records outcome + lesson.
 */

import { NextRequest, NextResponse } from "next/server";
import { closeTrade } from "@/lib/journal/service";
import { placeOrder } from "@/lib/alpaca/client";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id || "");
    const reason = (body.reason as "take_profit" | "stop_loss" | "time_exit" | "manual") || "manual";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const trade = await db.trade.findUnique({ where: { id } });
    if (!trade) return NextResponse.json({ error: "trade not found" }, { status: 404 });
    if (trade.status === "CLOSED") {
      return NextResponse.json({ error: "already closed" }, { status: 400 });
    }

    // Reverse the position via Alpaca
    const side = trade.direction === "LONG" ? "sell" : "buy";
    const order = await placeOrder(trade.symbol, trade.quantity, side);

    const closed = await closeTrade(id, reason);
    return NextResponse.json({ trade: closed, order });
  } catch (e: any) {
    console.error("/api/close-trade error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
