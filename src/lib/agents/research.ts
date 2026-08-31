/**
 * Research Agents — Technical, Fundamental, Sentiment, Macro
 *
 * Each agent uses z-ai-web-dev-sdk to analyze the given symbol from its
 * specialized lens and returns a structured JSON signal.
 *
 * If the LLM call fails or returns invalid JSON, the agent falls back to a
 * deterministic rule-based signal so the pipeline never crashes.
 */

import ZAI from "z-ai-web-dev-sdk";
import { getQuote, getSectorMap } from "@/lib/alpaca/client";

export type AgentName = "technical" | "fundamental" | "sentiment" | "macro";
export type Direction = "LONG" | "SHORT" | "NEUTRAL";

export interface AgentSignal {
  agent: AgentName;
  direction: Direction;
  confidence: number; // 0..1
  reasoning: string;
  keyMetrics: Record<string, string | number>;
}

export interface AggregatedAnalysis {
  symbol: string;
  price: number;
  technical: AgentSignal;
  fundamental: AgentSignal;
  sentiment: AgentSignal;
  macro: AgentSignal;
}

const SECTOR_MACRO_BIAS: Record<string, number> = {
  Technology: 0.6,
  Automotive: 0.45,
  Consumer: 0.5,
  Financials: 0.4,
  Energy: 0.35,
};

// ---------------------------------------------------------------------------
// LLM helper
// ---------------------------------------------------------------------------

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
    // Extract first JSON object
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as T;
  } catch (e) {
    console.warn("LLM call failed:", (e as Error)?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Technical Agent — price & volume action, momentum, RSI, MA crossover
// ---------------------------------------------------------------------------

export async function runTechnicalAgent(symbol: string): Promise<AgentSignal> {
  const quote = await getQuote(symbol);
  if (!quote) {
    return {
      agent: "technical",
      direction: "NEUTRAL",
      confidence: 0.3,
      reasoning: "No quote data available",
      keyMetrics: {},
    };
  }

  // Mock technical indicators derived from price
  const rsi = 30 + Math.random() * 50;
  const maShort = quote.price * (1 + (Math.random() - 0.5) * 0.02);
  const maLong = quote.price * (1 + (Math.random() - 0.5) * 0.04);
  const volumeSpike = Math.random() > 0.6;
  const momentum = (quote.price - maLong) / maLong;

  const llm = await llmJson<{ direction: Direction; confidence: number; reasoning: string }>(
    `You are a Technical Analyst. Analyze ONLY price-action, momentum, RSI, and moving averages. Return JSON: {direction, confidence (0-1), reasoning (1 sentence)}.`,
    `Symbol: ${symbol}
Price: $${quote.price}
RSI(14): ${rsi.toFixed(1)}
MA20: $${maShort.toFixed(2)}
MA50: $${maLong.toFixed(2)}
Momentum vs MA50: ${(momentum * 100).toFixed(2)}%
Volume spike: ${volumeSpike ? "yes" : "no"}`
  );

  if (llm) {
    return {
      agent: "technical",
      direction: llm.direction,
      confidence: Math.min(0.95, Math.max(0.1, llm.confidence)),
      reasoning: llm.reasoning,
      keyMetrics: {
        price: quote.price,
        rsi: Number(rsi.toFixed(1)),
        ma20: Number(maShort.toFixed(2)),
        ma50: Number(maLong.toFixed(2)),
        momentum_pct: Number((momentum * 100).toFixed(2)),
      },
    };
  }

  // Fallback: deterministic rule-based signal
  const dir: Direction = rsi > 65 ? "SHORT" : rsi < 35 ? "LONG" : momentum > 0.01 ? "LONG" : momentum < -0.01 ? "SHORT" : "NEUTRAL";
  const conf = Math.min(0.85, 0.4 + Math.abs(momentum) * 8 + (volumeSpike ? 0.1 : 0));
  return {
    agent: "technical",
    direction: dir,
    confidence: Number(conf.toFixed(2)),
    reasoning: `RSI ${rsi.toFixed(0)}, price ${(momentum * 100).toFixed(2)}% vs MA50, volume spike ${volumeSpike}.`,
    keyMetrics: {
      price: quote.price,
      rsi: Number(rsi.toFixed(1)),
      ma20: Number(maShort.toFixed(2)),
      ma50: Number(maLong.toFixed(2)),
      momentum_pct: Number((momentum * 100).toFixed(2)),
    },
  };
}

// ---------------------------------------------------------------------------
// Fundamental Agent — valuation, P/E, revenue growth, margin
// ---------------------------------------------------------------------------

export async function runFundamentalAgent(symbol: string): Promise<AgentSignal> {
  const sectorMap = getSectorMap();
  const sector = sectorMap[symbol.toUpperCase()] || "Unknown";

  // Mock fundamental metrics
  const pe = 8 + Math.random() * 50;
  const revGrowth = -0.05 + Math.random() * 0.4;
  const fcfMargin = -0.05 + Math.random() * 0.35;
  const debtToEquity = Math.random() * 2;

  const llm = await llmJson<{ direction: Direction; confidence: number; reasoning: string }>(
    `You are a Fundamental Analyst. Evaluate valuation, growth, and balance-sheet quality. Return JSON: {direction, confidence (0-1), reasoning (1 sentence)}.`,
    `Symbol: ${symbol} (Sector: ${sector})
P/E ratio: ${pe.toFixed(1)}
Revenue growth YoY: ${(revGrowth * 100).toFixed(1)}%
FCF margin: ${(fcfMargin * 100).toFixed(1)}%
Debt/Equity: ${debtToEquity.toFixed(2)}`
  );

  if (llm) {
    return {
      agent: "fundamental",
      direction: llm.direction,
      confidence: Math.min(0.95, Math.max(0.1, llm.confidence)),
      reasoning: llm.reasoning,
      keyMetrics: {
        pe: Number(pe.toFixed(1)),
        rev_growth_pct: Number((revGrowth * 100).toFixed(1)),
        fcf_margin_pct: Number((fcfMargin * 100).toFixed(1)),
        debt_to_equity: Number(debtToEquity.toFixed(2)),
      },
    };
  }

  const score =
    (pe < 25 ? 0.2 : -0.1) +
    (revGrowth > 0.15 ? 0.3 : revGrowth > 0 ? 0.1 : -0.2) +
    (fcfMargin > 0.15 ? 0.2 : fcfMargin > 0 ? 0.05 : -0.15) +
    (debtToEquity < 1 ? 0.1 : -0.1);
  const dir: Direction = score > 0.3 ? "LONG" : score < -0.2 ? "SHORT" : "NEUTRAL";
  const conf = Math.min(0.85, 0.4 + Math.abs(score));
  return {
    agent: "fundamental",
    direction: dir,
    confidence: Number(conf.toFixed(2)),
    reasoning: `P/E ${pe.toFixed(0)}, rev growth ${(revGrowth * 100).toFixed(0)}%, FCF margin ${(fcfMargin * 100).toFixed(0)}%, D/E ${debtToEquity.toFixed(1)}.`,
    keyMetrics: {
      pe: Number(pe.toFixed(1)),
      rev_growth_pct: Number((revGrowth * 100).toFixed(1)),
      fcf_margin_pct: Number((fcfMargin * 100).toFixed(1)),
      debt_to_equity: Number(debtToEquity.toFixed(2)),
    },
  };
}

// ---------------------------------------------------------------------------
// Sentiment Agent — news / social / analyst ratings
// ---------------------------------------------------------------------------

export async function runSentimentAgent(symbol: string): Promise<AgentSignal> {
  // Mock sentiment signals
  const newsScore = -0.5 + Math.random(); // -0.5..0.5
  const socialScore = -0.5 + Math.random();
  const analystRating = 1 + Math.floor(Math.random() * 5); // 1=Strong Sell..5=Strong Buy

  const llm = await llmJson<{ direction: Direction; confidence: number; reasoning: string }>(
    `You are a Sentiment Analyst. Weigh news, social chatter, and analyst ratings. Return JSON: {direction, confidence (0-1), reasoning (1 sentence)}.`,
    `Symbol: ${symbol}
News sentiment score: ${newsScore.toFixed(2)} (-0.5..+0.5)
Social sentiment score: ${socialScore.toFixed(2)} (-0.5..+0.5)
Analyst rating: ${analystRating}/5 (1=Strong Sell, 5=Strong Buy)`
  );

  if (llm) {
    return {
      agent: "sentiment",
      direction: llm.direction,
      confidence: Math.min(0.9, Math.max(0.1, llm.confidence)),
      reasoning: llm.reasoning,
      keyMetrics: {
        news_score: Number(newsScore.toFixed(2)),
        social_score: Number(socialScore.toFixed(2)),
        analyst_rating: analystRating,
      },
    };
  }

  const combined = newsScore + socialScore + (analystRating - 3) * 0.2;
  const dir: Direction = combined > 0.3 ? "LONG" : combined < -0.3 ? "SHORT" : "NEUTRAL";
  const conf = Math.min(0.8, 0.4 + Math.abs(combined));
  return {
    agent: "sentiment",
    direction: dir,
    confidence: Number(conf.toFixed(2)),
    reasoning: `News ${newsScore.toFixed(2)}, social ${socialScore.toFixed(2)}, analyst ${analystRating}/5.`,
    keyMetrics: {
      news_score: Number(newsScore.toFixed(2)),
      social_score: Number(socialScore.toFixed(2)),
      analyst_rating: analystRating,
    },
  };
}

// ---------------------------------------------------------------------------
// Macro Agent — interest rates, inflation, USD, sector rotation
// ---------------------------------------------------------------------------

export async function runMacroAgent(symbol: string): Promise<AgentSignal> {
  const sectorMap = getSectorMap();
  const sector = sectorMap[symbol.toUpperCase()] || "Unknown";

  // Mock macro state
  const rates = 3.5 + Math.random() * 2.5;
  const inflation = 2 + Math.random() * 3;
  const usdIndex = 95 + Math.random() * 15;
  const sectorBias = SECTOR_MACRO_BIAS[sector] ?? 0.4;

  const llm = await llmJson<{ direction: Direction; confidence: number; reasoning: string }>(
    `You are a Macro Strategist. Evaluate interest rates, inflation, USD strength, and sector headwinds/tailwinds. Return JSON: {direction, confidence (0-1), reasoning (1 sentence)}.`,
    `Symbol: ${symbol} (Sector: ${sector})
10Y yield: ${rates.toFixed(2)}%
CPI inflation: ${inflation.toFixed(2)}%
DXY (USD index): ${usdIndex.toFixed(1)}
Sector macro bias: ${sectorBias > 0.5 ? "tailwind" : sectorBias < 0.4 ? "headwind" : "neutral"} (${sectorBias.toFixed(2)})`
  );

  if (llm) {
    return {
      agent: "macro",
      direction: llm.direction,
      confidence: Math.min(0.85, Math.max(0.1, llm.confidence)),
      reasoning: llm.reasoning,
      keyMetrics: {
        ten_year_yield: Number(rates.toFixed(2)),
        cpi: Number(inflation.toFixed(2)),
        dxy: Number(usdIndex.toFixed(1)),
        sector_bias: sectorBias,
      },
    };
  }

  const dir: Direction = sectorBias > 0.55 ? "LONG" : sectorBias < 0.4 ? "SHORT" : "NEUTRAL";
  const conf = 0.4 + Math.abs(sectorBias - 0.5);
  return {
    agent: "macro",
    direction: dir,
    confidence: Number(Math.min(0.85, conf).toFixed(2)),
    reasoning: `Rates ${rates.toFixed(1)}%, CPI ${inflation.toFixed(1)}%, DXY ${usdIndex.toFixed(0)}, sector bias ${sectorBias.toFixed(2)}.`,
    keyMetrics: {
      ten_year_yield: Number(rates.toFixed(2)),
      cpi: Number(inflation.toFixed(2)),
      dxy: Number(usdIndex.toFixed(1)),
      sector_bias: sectorBias,
    },
  };
}

// ---------------------------------------------------------------------------
// Run all agents in parallel
// ---------------------------------------------------------------------------

export async function runAllAgents(symbol: string): Promise<AggregatedAnalysis> {
  const quote = await getQuote(symbol);
  const [technical, fundamental, sentiment, macro] = await Promise.all([
    runTechnicalAgent(symbol),
    runFundamentalAgent(symbol),
    runSentimentAgent(symbol),
    runMacroAgent(symbol),
  ]);

  return {
    symbol: symbol.toUpperCase(),
    price: quote?.price ?? 0,
    technical,
    fundamental,
    sentiment,
    macro,
  };
}
