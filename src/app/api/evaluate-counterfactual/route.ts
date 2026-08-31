/**
 * POST /api/evaluate-counterfactual
 * Body: { id: string }
 *
 * Fetches the current price for the rejected symbol, computes what would
 * have happened if the trade had been executed, and generates an
 * explanation via LLM (with deterministic fallback).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getQuote } from "@/lib/alpaca/client";
import ZAI from "z-ai-web-dev-sdk";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const cf = await db.counterfactual.findUnique({ where: { id } });
    if (!cf) return NextResponse.json({ error: "not found" }, { status: 404 });

    const quote = await getQuote(cf.symbol);
    if (!quote) return NextResponse.json({ error: "no quote" }, { status: 500 });

    const priceNow = quote.price;
    const priceThen = cf.priceAtRejection;

    // What would the outcome have been?
    const pctMove = (priceNow - priceThen) / priceThen;
    const counterfactualOutcome =
      cf.direction === "LONG" ? pctMove : cf.direction === "SHORT" ? -pctMove : 0;
    const profitable = counterfactualOutcome > 0;

    // Generate explanation via LLM (fallback deterministic)
    let explanation = "";
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a Risk Governor explaining a rejected trade after the market has moved. Be honest, concise (2-3 sentences), and reference the specific rejection rule. End by stating whether the rejection was the right call given the counterfactual outcome.",
          },
          {
            role: "user",
            content: `Rejected trade:
Symbol: ${cf.symbol}
Direction: ${cf.direction}
Original thesis: ${cf.thesis}
Confidence: ${(cf.confidence * 100).toFixed(0)}%
Expected return: ${(cf.expectedReturn * 100).toFixed(2)}%
Rejection rule: ${cf.rejectionRule}
Rejection reason: ${cf.rejectionReason}

Price at rejection: $${priceThen.toFixed(2)}
Price now: $${priceNow.toFixed(2)}
Counterfactual outcome (if executed): ${(counterfactualOutcome * 100).toFixed(2)}% ${profitable ? "(profitable)" : "(loss)"}

Was the rejection the right call? Explain in 2-3 sentences.`,
          },
        ],
        thinking: { type: "disabled" },
      });
      explanation = completion.choices[0]?.message?.content || "";
    } catch (e) {
      // Fallback
      explanation = profitable
        ? `The trade would have been profitable (${(counterfactualOutcome * 100).toFixed(2)}%), but executing it would have violated the ${cf.rejectionRule} rule: "${cf.rejectionReason}". The system prioritized portfolio risk over individual trade opportunity.`
        : `The rejection was correct — the trade would have lost ${(counterfactualOutcome * 100).toFixed(2)}%. The ${cf.rejectionRule} rule protected the portfolio: ${cf.rejectionReason}.`;
    }

    const updated = await db.counterfactual.update({
      where: { id },
      data: {
        priceAfterMove: priceNow,
        counterfactualOutcome: Number(counterfactualOutcome.toFixed(4)),
        counterfactualProfitable: profitable,
        counterfactualExplanation: explanation,
        evaluatedAt: new Date(),
      },
    });

    return NextResponse.json({ counterfactual: updated });
  } catch (e: any) {
    console.error("/api/evaluate-counterfactual error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
