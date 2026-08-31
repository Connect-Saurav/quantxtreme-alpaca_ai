/**
 * GET /api/risk-config    — get current Risk Governor config
 * PATCH /api/risk-config  — update config (body = partial config)
 */

import { NextRequest, NextResponse } from "next/server";
import { getRiskConfig, updateRiskConfig } from "@/lib/risk/governor";

export async function GET() {
  try {
    const cfg = await getRiskConfig();
    return NextResponse.json({ config: cfg });
  } catch (e: any) {
    console.error("/api/risk-config GET error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const allowed: (keyof typeof body)[] = [
      "maxPositionSize",
      "maxSectorExposure",
      "maxTotalExposure",
      "minConfidence",
      "maxDrawdown",
      "minExpectedReturn",
      "startingCapital",
    ];
    const patch: any = {};
    for (const k of allowed) {
      if (typeof body[k] === "number") patch[k] = body[k];
    }
    const cfg = await updateRiskConfig(patch);
    return NextResponse.json({ config: cfg });
  } catch (e: any) {
    console.error("/api/risk-config PATCH error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
