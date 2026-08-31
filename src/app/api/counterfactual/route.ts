/**
 * GET /api/counterfactual
 *   Returns all rejected proposals (counterfactual memory).
 *
 * POST /api/counterfactual/evaluate (see evaluate-counterfactual/route.ts)
 *   Re-evaluates a counterfactual: fetches current price, computes what
 *   would have happened if executed, and asks LLM to explain.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const onlyUnjustified = req.nextUrl.searchParams.get("unjustified") === "true";
    const where: any = {};
    if (onlyUnjustified) where.counterfactualExplanation = null;

    const items = await db.counterfactual.findMany({
      where,
      orderBy: { rejectedAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ counterfactuals: items });
  } catch (e: any) {
    console.error("/api/counterfactual error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
