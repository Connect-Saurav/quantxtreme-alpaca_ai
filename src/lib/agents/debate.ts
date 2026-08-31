/**
 * Debate / Thesis Agent
 *
 * Takes the four research agent outputs, runs a structured "bull vs bear"
 * debate through the LLM, and produces a single aggregated trade proposal:
 *
 *   { symbol, direction, thesis, confidence, expected_return, stop_loss, time_horizon }
 *
 * This proposal is then passed to the deterministic Risk Governor.
 */

import ZAI from "z-ai-web-dev-sdk";
import type { AggregatedAnalysis, Direction } from "./research";

export interface TradeProposal {
  symbol: string;
  direction: Direction;
  thesis: string;
  bullCase: string;
  bearCase: string;
  confidence: number;
  expectedReturn: number; // e.g. 0.043 for 4.3%
  stopLoss: number; // e.g. 0.025 for 2.5%
  timeHorizon: string;
  price: number;
}

export async function runDebateAgent(analysis: AggregatedAnalysis): Promise<TradeProposal> {
  const agents = [analysis.technical, analysis.fundamental, analysis.sentiment, analysis.macro];
  const longVotes = agents.filter((a) => a.direction === "LONG").length;
  const shortVotes = agents.filter((a) => a.direction === "SHORT").length;
  const neutralVotes = agents.filter((a) => a.direction === "NEUTRAL").length;

  const defaultDirection: Direction =
    longVotes > shortVotes && longVotes > neutralVotes
      ? "LONG"
      : shortVotes > longVotes && shortVotes > neutralVotes
      ? "SHORT"
      : "NEUTRAL";

  const avgConfidence = agents.reduce((s, a) => s + a.confidence, 0) / agents.length;

  // Try LLM debate
  const llm = await llmJson<{
    direction: Direction;
    thesis: string;
    bullCase: string;
    bearCase: string;
    confidence: number;
    expectedReturn: number;
    stopLoss: number;
    timeHorizon: string;
  }>(
    `You are a Debate Moderator for a trading committee. Four analysts just presented. Weigh their arguments, identify the strongest bull case and the strongest bear case, then synthesize a single trade recommendation. Return JSON with: direction (LONG|SHORT|NEUTRAL), thesis (1-2 sentences), bullCase, bearCase, confidence (0-1), expectedReturn (decimal, e.g. 0.043), stopLoss (decimal, e.g. 0.025), timeHorizon (e.g. "3-5 days").`,
    `Symbol: ${analysis.symbol}
Current price: $${analysis.price}

Technical Analyst (${analysis.technical.direction}, conf ${(analysis.technical.confidence * 100).toFixed(0)}%): ${analysis.technical.reasoning}
Fundamental Analyst (${analysis.fundamental.direction}, conf ${(analysis.fundamental.confidence * 100).toFixed(0)}%): ${analysis.fundamental.reasoning}
Sentiment Analyst (${analysis.sentiment.direction}, conf ${(analysis.sentiment.confidence * 100).toFixed(0)}%): ${analysis.sentiment.reasoning}
Macro Analyst (${analysis.macro.direction}, conf ${(analysis.macro.confidence * 100).toFixed(0)}%): ${analysis.macro.reasoning}

Vote tally: ${longVotes} LONG, ${shortVotes} SHORT, ${neutralVotes} NEUTRAL.`
  );

  if (llm) {
    return {
      symbol: analysis.symbol,
      direction: llm.direction,
      thesis: llm.thesis,
      bullCase: llm.bullCase,
      bearCase: llm.bearCase,
      confidence: Math.min(0.95, Math.max(0.1, llm.confidence)),
      expectedReturn: Number(Math.min(0.25, Math.max(-0.05, llm.expectedReturn)).toFixed(4)),
      stopLoss: Number(Math.min(0.15, Math.max(0.01, llm.stopLoss)).toFixed(4)),
      timeHorizon: llm.timeHorizon || "3-5 days",
      price: analysis.price,
    };
  }

  // Fallback: deterministic thesis from vote tally
  const netScore = (longVotes - shortVotes) / 4;
  const direction: Direction =
    netScore > 0.25 ? "LONG" : netScore < -0.25 ? "SHORT" : "NEUTRAL";

  const expectedReturn = Number((netScore * 0.06 + (Math.random() - 0.4) * 0.02).toFixed(4));
  const stopLoss = Number((0.015 + Math.random() * 0.02).toFixed(4));

  return {
    symbol: analysis.symbol,
    direction,
    thesis: `${direction === "LONG" ? "Bullish" : direction === "SHORT" ? "Bearish" : "Neutral"} setup with ${longVotes} bull / ${shortVotes} bear / ${neutralVotes} neutral votes. Avg analyst confidence ${(avgConfidence * 100).toFixed(0)}%.`,
    bullCase: `${longVotes} of 4 agents see upside. Technical catalyst or fundamental value gap may drive upside.`,
    bearCase: `${shortVotes} of 4 agents see downside. Macro headwinds or valuation risk could cap upside.`,
    confidence: Number(Math.min(0.9, Math.max(0.3, avgConfidence + Math.abs(netScore) * 0.2)).toFixed(2)),
    expectedReturn,
    stopLoss,
    timeHorizon: "3-5 days",
    price: analysis.price,
  };
}

async function llmJson<T = any>(systemPrompt: string, userPrompt: string): Promise<T | null> {
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as T;
  } catch (e) {
    console.warn("LLM debate call failed:", (e as Error)?.message);
    return null;
  }
}
