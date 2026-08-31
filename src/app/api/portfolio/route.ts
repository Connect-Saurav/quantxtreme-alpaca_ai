/**
 * GET /api/portfolio — current account state + open positions
 */

import { NextResponse } from "next/server";
import { getAccount, getPositions, ALPACA_MODE, listUniverse } from "@/lib/alpaca/client";

export async function GET() {
  try {
    const [account, positions] = await Promise.all([getAccount(), getPositions()]);
    const universe = listUniverse();
    return NextResponse.json({
      mode: ALPACA_MODE,
      account,
      positions,
      universe,
    });
  } catch (e: any) {
    console.error("/api/portfolio error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
