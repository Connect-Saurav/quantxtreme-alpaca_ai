/**
 * GET /api/stats — aggregated trade journal statistics (post-trade learning)
 */

import { NextResponse } from "next/server";
import { computeStats } from "@/lib/journal/service";

export async function GET() {
  try {
    const stats = await computeStats();
    return NextResponse.json({ stats });
  } catch (e: any) {
    console.error("/api/stats error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
