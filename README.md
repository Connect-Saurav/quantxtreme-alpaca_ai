# Alpaca Trading Committee — AI Risk Governor

An advanced AI-powered trading system built on the **Alpaca** paper-trading API, implementing the **Trading Committee + Risk Governor** architecture:

```
Market Data → Research Agents (4) → Debate/Thesis → Risk Governor → Alpaca Executor → Trade Monitor
                                            ↓
                                  Counterfactual Memory (USP #1)
                                            ↓
                                  Trade Journal + Post-Trade Learning (USP #2)
```

> **AI proposes. Rules verify. Alpaca executes.**

## Architecture

### 1. Research Agents (4 LLM-powered analysts)
- **Technical Agent** — RSI, moving averages, momentum, volume
- **Fundamental Agent** — P/E, revenue growth, FCF margin, debt/equity
- **Sentiment Agent** — news, social chatter, analyst ratings
- **Macro Agent** — interest rates, inflation, USD, sector bias

Each agent is powered by `z-ai-web-dev-sdk` (GLM-4) and falls back to a deterministic rule-based signal if the LLM call fails.

### 2. Debate / Thesis Agent
Synthesizes the four agents' outputs into a single trade proposal:
```json
{
  "symbol": "NVDA",
  "direction": "LONG",
  "thesis": "...",
  "bullCase": "...",
  "bearCase": "...",
  "confidence": 0.81,
  "expected_return": 0.043,
  "stop_loss": 0.018,
  "time_horizon": "3-5 days"
}
```

### 3. Risk Governor (DETERMINISTIC)
The risk engine is **not** AI — it is fully deterministic. It checks 8 rules:

| Rule | Description | Default |
|------|-------------|---------|
| `min_confidence` | Minimum analyst confidence | 0.65 |
| `min_expected_return` | Minimum expected return | 2% |
| `max_drawdown` | Halt if portfolio drawdown exceeds limit | 15% |
| `max_position_size` | Single position cap | 10% of equity |
| `max_sector_exposure` | Sector cap | 35% |
| `max_total_exposure` | Total long+short cap | 80% |
| `direction_valid` | Reject NEUTRAL | — |
| `existing_position_cap` | Don't double up beyond 1.5x position cap | — |

Position sizing uses a **Kelly-lite** formula scaled by confidence and expected return, capped at `max_position_size`.

### 4. Alpaca Executor
Wraps the Alpaca REST API. Two modes:
- **MOCK** (default) — synthetic price engine, no API key needed
- **LIVE** — calls real Alpaca paper-trading API

To enable LIVE mode, set environment variables:
```bash
ALPACA_API_KEY=your_key
ALPACA_API_SECRET=your_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

### 5. USP #1 — Counterfactual Memory ("Why didn't you trade?")
Every rejected proposal is stored. After the market moves, the system fetches the current price, computes what would have happened if the trade had been executed, and asks the LLM to explain whether the rejection was the right call:

> *"The trade would have been profitable, but executing it would have exceeded our semiconductor exposure limit. The system prioritized portfolio risk over individual trade opportunity."*

### 6. USP #2 — Trade Journal + Post-Trade Learning
Every trade records the full pipeline:
```
THESIS → SIGNALS USED → DECISION → EXECUTION → POSITION → OUTCOME →
THESIS CORRECT? → LESSON
```

After 20+ trades, the stats page reveals patterns:
- **Win rate by signal type** (e.g. technical+sentiment: 67% vs sentiment-only: 43%)
- **Sharpe by confidence bucket** (e.g. high confidence: 1.31 vs low: 0.42)
- **Performance by sector**

## Tech Stack
- **Next.js 16** (App Router) + TypeScript
- **Prisma ORM** with SQLite (file-based, no external DB)
- **Tailwind CSS 4** + shadcn/ui (dark trading-themed palette)
- **z-ai-web-dev-sdk** for LLM-powered agents (GLM-4)
- **Recharts** for stats visualizations
- **Alpaca REST API** for execution

## Quick Start

### Prerequisites
- Node.js 18+ / Bun
- (Optional) Alpaca paper-trading API key

### Install
```bash
bun install
```

### Configure environment
Create `.env`:
```
DATABASE_URL=file:./db/custom.db
# Optional — leave blank to use MOCK mode
ALPACA_API_KEY=
ALPACA_API_SECRET=
ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

### Initialize database
```bash
bun run db:push
```

### Run dev server
```bash
bun run dev
# Open http://localhost:3000
```

### Seed demo data
```bash
bun run scripts/seed-trades.ts   # analyze universe + execute approved trades
bun run scripts/seed-journal.ts  # close trades + evaluate counterfactuals
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx                     # Main dashboard (single route)
│   ├── layout.tsx
│   ├── globals.css                  # Trading-themed dark palette
│   └── api/
│       ├── analyze/route.ts         # POST: run full pipeline for symbol
│       ├── execute/route.ts         # POST: execute approved trade via Alpaca
│       ├── trades/route.ts          # GET: list trades (open/closed)
│       ├── close-trade/route.ts     # POST: close trade + record lesson
│       ├── counterfactual/route.ts  # GET: list rejected proposals
│       ├── evaluate-counterfactual/ # POST: compute "what would have happened"
│       ├── stats/route.ts           # GET: aggregated post-trade learning stats
│       ├── portfolio/route.ts       # GET: account + positions + universe
│       ├── risk-config/route.ts     # GET/PATCH: risk governor config
│       └── run-batch/route.ts       # POST: analyze entire universe
├── components/trading/
│   ├── overview-panel.tsx           # Dashboard with feed + positions + universe
│   ├── analyze-panel.tsx            # Single-symbol analysis UI
│   ├── counterfactual-panel.tsx     # Rejected opportunities + explanations
│   ├── journal-panel.tsx            # Trade journal with full pipeline
│   ├── stats-panel.tsx              # Post-trade learning charts
│   ├── risk-config-panel.tsx        # Risk Governor config editor
│   └── format.ts                    # Shared formatters
└── lib/
    ├── alpaca/client.ts             # Alpaca SDK wrapper (MOCK + LIVE)
    ├── agents/
    │   ├── research.ts              # 4 research agents (LLM-powered)
    │   └── debate.ts                # Debate/Thesis agent
    ├── risk/governor.ts             # DETERMINISTIC risk engine (8 rules)
    ├── journal/service.ts           # Trade journal + stats aggregation
    └── db.ts                        # Prisma client
prisma/
└── schema.prisma                    # Trade, Counterfactual, Analysis, RiskConfig
scripts/
├── seed-trades.ts                  # Seed approved trades
└── seed-journal.ts                 # Close trades + evaluate counterfactuals
```

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/portfolio` | GET | Account, positions, asset universe |
| `/api/analyze` | POST | Run 4 agents → debate → risk governor |
| `/api/execute` | POST | Execute approved trade via Alpaca |
| `/api/trades?status=open\|closed\|all` | GET | List trades |
| `/api/close-trade` | POST | Close trade at market, compute outcome + lesson |
| `/api/counterfactual` | GET | List rejected proposals |
| `/api/evaluate-counterfactual` | POST | Compute counterfactual outcome + LLM explanation |
| `/api/stats` | GET | Aggregated post-trade learning stats |
| `/api/risk-config` | GET/PATCH | Risk Governor configuration |
| `/api/run-batch` | POST | Analyze entire universe |

## Key Design Decisions

1. **AI proposes, rules verify.** The Risk Governor is fully deterministic. AI cannot override rejections — it can only explain them.

2. **Counterfactual memory.** Every rejection is stored with full context. After the market moves, the system honestly evaluates whether the rejection was the right call.

3. **Post-trade learning.** The trade journal records the full pipeline for every trade. Statistics are computed by signal type, confidence bucket, and sector.

4. **Graceful degradation.** Every LLM call has a deterministic fallback. The system works even if the LLM API is down.

5. **Mock mode by default.** No Alpaca API key required to demo. Just `bun install && bun run db:push && bun run dev`.

## Disclaimer

This system is for **paper trading only** by default. Even in LIVE mode, it uses Alpaca's paper-trading endpoint. Do not use with real money without thorough testing and understanding of the risks.

The AI agents use simulated market data in MOCK mode and may produce incorrect analysis. Always do your own research.
