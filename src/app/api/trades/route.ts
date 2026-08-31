/**
 * GET /api/trades
 *   Returns all trades (open + closed) with full journal pipeline.
 * ?status=open|closed|all  (default all)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status") || "all";
    const where: any = {};
    if (status === "open") where.status = "OPEN";
    if (status === "closed") where.status = "CLOSED";

    const trades = await db.trade.findMany({
      where,
      orderBy: { entryAt: "desc" },
      take: 200,
    });

    const parsed = trades.map((t) => ({
      ...t,
      signalsUsed: JSON.parse(t.signalsUsed),
    }));

    return NextResponse.json({ trades: parsed });
  } catch (e: any) {
    console.error("/api/trades error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
