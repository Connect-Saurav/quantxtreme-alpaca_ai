/**
 * Alpaca Client Wrapper
 *
 * Supports two modes:
 *   - MOCK: Uses seeded synthetic prices for demo (no API key required)
 *   - LIVE: Calls real Alpaca REST API (paper trading)
 *
 * Set environment variable:
 *   ALPACA_API_KEY=<your key>
 *   ALPACA_API_SECRET=<your secret>
 *   ALPACA_BASE_URL=https://paper-api.alpaca.markets
 *
 * If no API key is configured, the client falls back to MOCK mode automatically
 * and logs a warning so the rest of the pipeline keeps working.
 */

export type AlpacaMode = "MOCK" | "LIVE";

export interface Quote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  ts: number;
  source: AlpacaMode;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  filledPrice: number;
  status: "filled" | "rejected" | "pending";
  source: AlpacaMode;
  ts: number;
}

export interface Position {
  symbol: string;
  qty: number;
  side: "long" | "short";
  avgEntryPrice: number;
  marketValue: number;
  unrealizedPnl: number;
}

export interface Account {
  equity: number;
  cash: number;
  buyingPower: number;
  longMarketValue: number;
  shortMarketValue: number;
}

const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_API_SECRET;
const ALPACA_BASE = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";

export const ALPACA_MODE: AlpacaMode = ALPACA_KEY && ALPACA_SECRET ? "LIVE" : "MOCK";

// ---------------------------------------------------------------------------
// MOCK price engine — deterministic-ish but with seeded volatility
// ---------------------------------------------------------------------------

const SEED_PRICES: Record<string, { price: number; vol: number; sector: string; name: string }> = {
  NVDA: { price: 920, vol: 0.028, sector: "Technology", name: "NVIDIA Corp." },
  AAPL: { price: 215, vol: 0.014, sector: "Technology", name: "Apple Inc." },
  TSLA: { price: 245, vol: 0.034, sector: "Automotive", name: "Tesla, Inc." },
  MSFT: { price: 425, vol: 0.013, sector: "Technology", name: "Microsoft Corp." },
  AMZN: { price: 185, vol: 0.018, sector: "Consumer", name: "Amazon.com, Inc." },
  META: { price: 510, vol: 0.020, sector: "Technology", name: "Meta Platforms" },
  GOOGL: { price: 178, vol: 0.015, sector: "Technology", name: "Alphabet Inc." },
  AMD: { price: 168, vol: 0.031, sector: "Technology", name: "Advanced Micro Devices" },
  JPM: { price: 215, vol: 0.012, sector: "Financials", name: "JPMorgan Chase" },
  XOM: { price: 118, vol: 0.016, sector: "Energy", name: "Exxon Mobil" },
};

const priceState: Record<string, number> = {};
Object.entries(SEED_PRICES).forEach(([k, v]) => (priceState[k] = v.price));

function mockQuote(symbol: string): Quote | null {
  const sym = symbol.toUpperCase();
  const seed = SEED_PRICES[sym];
  if (!seed) return null;
  const last = priceState[sym];
  const drift = (Math.random() - 0.5) * 2 * seed.vol * last;
  const next = Math.max(0.01, last + drift);
  priceState[sym] = next;
  const spread = next * 0.0005;
  return {
    symbol: sym,
    price: Number(next.toFixed(2)),
    bid: Number((next - spread).toFixed(2)),
    ask: Number((next + spread).toFixed(2)),
    ts: Date.now(),
    source: "MOCK",
  };
}

let mockCash = 100000;
const mockPositions: Record<string, { qty: number; side: "long" | "short"; avgEntry: number }> = {};

function mockAccount(): Account {
  let longMv = 0;
  let shortMv = 0;
  Object.entries(mockPositions).forEach(([sym, p]) => {
    const q = priceState[sym] ?? SEED_PRICES[sym]?.price ?? 0;
    const mv = p.qty * q;
    if (p.side === "long") longMv += mv;
    else shortMv += mv;
  });
  return {
    equity: Number((mockCash + longMv - shortMv).toFixed(2)),
    cash: Number(mockCash.toFixed(2)),
    buyingPower: Number((mockCash * 4).toFixed(2)),
    longMarketValue: Number(longMv.toFixed(2)),
    shortMarketValue: Number(shortMv.toFixed(2)),
  };
}

function mockPositionsList(): Position[] {
  return Object.entries(mockPositions).map(([sym, p]) => {
    const q = priceState[sym] ?? SEED_PRICES[sym]?.price ?? 0;
    const mv = p.qty * q;
    const pnl = (p.side === "long" ? (q - p.avgEntry) : (p.avgEntry - q)) * p.qty;
    return {
      symbol: sym,
      qty: p.qty,
      side: p.side,
      avgEntryPrice: p.avgEntry,
      marketValue: Number(mv.toFixed(2)),
      unrealizedPnl: Number(pnl.toFixed(2)),
    };
  });
}

function mockPlaceOrder(symbol: string, qty: number, side: "buy" | "sell"): OrderResult {
  const sym = symbol.toUpperCase();
  const quote = mockQuote(sym)!;
  const price = quote.price;

  if (side === "buy") {
    mockCash -= qty * price;
    const existing = mockPositions[sym];
    if (existing && existing.side === "long") {
      const totalQty = existing.qty + qty;
      existing.avgEntry = (existing.avgEntry * existing.qty + price * qty) / totalQty;
      existing.qty = totalQty;
    } else {
      mockPositions[sym] = { qty, side: "long", avgEntry: price };
    }
  } else {
    mockCash += qty * price;
    const existing = mockPositions[sym];
    if (existing) {
      existing.qty -= qty;
      if (existing.qty <= 0.0001) delete mockPositions[sym];
    }
  }

  return {
    orderId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol: sym,
    qty,
    side,
    filledPrice: price,
    status: "filled",
    source: "MOCK",
    ts: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// LIVE Alpaca REST API
// ---------------------------------------------------------------------------

async function alpacaFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${ALPACA_BASE}${path}`, {
    ...init,
    headers: {
      "APCA-API-KEY-ID": ALPACA_KEY!,
      "APCA-API-SECRET-KEY": ALPACA_SECRET!,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca ${res.status}: ${text}`);
  }
  return res.json();
}

async function liveQuote(symbol: string): Promise<Quote | null> {
  try {
    const data = await alpacaFetch(`/v2/stocks/${symbol}/quotes/latest`);
    const q = data.quote;
    return {
      symbol: symbol.toUpperCase(),
      price: Number(q.ap),
      bid: Number(q.bp),
      ask: Number(q.ap),
      ts: q.t ? Date.parse(q.t) : Date.now(),
      source: "LIVE",
    };
  } catch {
    return null;
  }
}

async function liveAccount(): Promise<Account> {
  const data = await alpacaFetch(`/v2/account`);
  return {
    equity: Number(data.equity),
    cash: Number(data.cash),
    buyingPower: Number(data.buying_power),
    longMarketValue: Number(data.long_market_value),
    shortMarketValue: Number(data.short_market_value),
  };
}

async function livePositions(): Promise<Position[]> {
  const data = await alpacaFetch(`/v2/positions`);
  return data.map((p: any) => ({
    symbol: p.symbol,
    qty: Number(p.qty),
    side: p.side === "long" ? "long" : "short",
    avgEntryPrice: Number(p.avg_entry_price),
    marketValue: Number(p.market_value),
    unrealizedPnl: Number(p.unrealized_pl),
  }));
}

async function livePlaceOrder(symbol: string, qty: number, side: "buy" | "sell"): Promise<OrderResult> {
  const body = {
    symbol,
    qty: String(qty),
    side,
    type: "market",
    time_in_force: "day",
  };
  const data = await alpacaFetch(`/v2/orders`, { method: "POST", body: JSON.stringify(body) });
  return {
    orderId: data.id,
    symbol,
    qty,
    side,
    filledPrice: Number(data.filled_avg_price) || 0,
    status: data.status === "filled" ? "filled" : "pending",
    source: "LIVE",
    ts: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getQuote(symbol: string): Promise<Quote | null> {
  if (ALPACA_MODE === "LIVE") {
    return await liveQuote(symbol);
  }
  return mockQuote(symbol);
}

export async function getAccount(): Promise<Account> {
  if (ALPACA_MODE === "LIVE") {
    return await liveAccount();
  }
  return mockAccount();
}

export async function getPositions(): Promise<Position[]> {
  if (ALPACA_MODE === "LIVE") {
    return await livePositions();
  }
  return mockPositionsList();
}

export async function placeOrder(symbol: string, qty: number, side: "buy" | "sell"): Promise<OrderResult> {
  if (ALPACA_MODE === "LIVE") {
    return await livePlaceOrder(symbol, qty, side);
  }
  return mockPlaceOrder(symbol, qty, side);
}

export function listUniverse() {
  return Object.entries(SEED_PRICES).map(([ticker, info]) => ({
    ticker,
    name: info.name,
    sector: info.sector,
    basePrice: info.price,
    volatility: info.vol,
  }));
}

export function getSectorMap(): Record<string, string> {
  const out: Record<string, string> = {};
  Object.entries(SEED_PRICES).forEach(([k, v]) => (out[k] = v.sector));
  return out;
}
