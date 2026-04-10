<div align="center">
  <img src="docs/assets/logo.png" alt="Flux Logo" width="120" />
  <h1>Flux</h1>
  <p><strong>Self-evolving AI trading agent</strong></p>
  <p>An autonomous agent that discovers its own trading strategy through live experimentation,
  powered by a full-stack financial intelligence platform.</p>
  <p>
    <img src="https://img.shields.io/badge/status-alpha-orange" alt="Status: Alpha" />
    <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js" />
    <img src="https://img.shields.io/badge/Hono-4-orange" alt="Hono" />
    <img src="https://img.shields.io/badge/Prisma-7-2D3748" alt="Prisma" />
    <img src="https://img.shields.io/badge/Vercel_AI_SDK-6-000" alt="AI SDK" />
    <img src="https://img.shields.io/badge/Alpaca-API-FFCD00" alt="Alpaca" />
    <img src="https://img.shields.io/badge/Bun-1-f9f1e1" alt="Bun" />
  </p>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License" /></a>
  </p>
  <p><strong>English</strong> | <a href="README.zh-CN.md">中文</a></p>
</div>

> [!WARNING]
> **Flux is in very early development.** APIs, database schemas, and configuration formats may introduce breaking changes at any time without prior notice. This is an immature, experimental project — use at your own risk.

## Why Flux

- **Strategy emerges, not coded** — Inspired by Karpathy's autoresearch loop. The agent writes and evolves its own `strategy.md` through trading, not hand-crafted rules.
- **Signal over noise** — Layered market data (Alpha Vantage → Yahoo → RSS → Finnhub) with AI-driven analysis. Only decision-critical information surfaces.
- **Self-hosted, private** — Your data, your keys, your infrastructure. Deploy with `docker compose up` and own everything.

## Features

**Autonomous Trading**
- Heartbeat loop every 30 min during market hours — agent analyzes, trades, and journals autonomously
- Self-evolving strategy file — agent writes, tests, and refines its own rules
- FIFO P&L tracking with per-trade reasoning stored in DB
- Full order types: market, limit, stop, stop_limit, trailing_stop (Alpaca paper trading)
- Discord notifications on every trade

**Financial Intelligence**
- Real-time quotes, 6-period price charts, company fundamentals
- Multi-source news aggregation (RSS + Finnhub, 3-tier fallback)
- AI research reports with 24h caching (Gemini)
- Earnings analysis: L1 hard data (FMP) + L2 AI deep analysis (transcript → Gemini)

**AI Infrastructure**
- Plugin-based runtime — prompt, session, memory, tools, trading as composable plugins
- Agentic tool calling — agent autonomously fetches data, searches, and executes
- Vector memory (pgvector) — RAG-powered knowledge retrieval across sessions
- Multi-model support (Anthropic, OpenAI-compatible, xAI)
- Interactive copilot mode — chat-driven analysis and trading with guard rails

**Platform**
- Monorepo: Next.js 16 frontend + Hono API server + shared types
- End-to-end type safety via Hono RPC client
- Cron scheduler for heartbeat and morning brief
- Multi-channel: Web + Discord bot

## Quick Start

```bash
git clone https://github.com/glows777/flux.git
cd flux
cp .env.example .env
# Edit .env with your API keys

docker compose up -d
```

Open `http://localhost:3000` — dashboard is ready.

The auto-trading agent starts its heartbeat loop automatically during US market hours.

## Development

```bash
bun install
docker compose up -d db       # PostgreSQL only
bun run db:push               # Push schema
bun run db:generate           # Generate Prisma client
bun run dev                   # Next.js :3000 + Hono :3001
```

For destructive schema changes, use the one-time explicit rollout command instead of the default push:

```bash
bun run db:push:accept-data-loss
bun run db:generate
```

Use this only when the release intentionally drops tables or columns. The finance and Morning Brief removal release requires this command because it removes `EarningsCache` and `MorningBriefCache`.

```bash
bun run test:all              # Unit + integration + E2E
bun run lint                  # Biome check
```

## Architecture

```
packages/
  server/          Hono API + AI runtime + trading engine (port 3001)
  web/             Next.js 16 frontend (port 3000)
  shared/          Cross-package types, schemas, utilities
```

```
Cron Heartbeat ──→ Gateway Router ──→ Auto-Trading Agent ──→ Alpaca (paper)
                        ↑                                        ↓
User (Web/Discord) ──→ │ ──→ Trading Copilot               Order DB + Discord
                        ↓
                   AI Runtime (plugin pipeline)
                   ├── Prompt / Session / Memory
                   ├── Tools (market data, research, trading)
                   └── Models (Anthropic, OpenAI-compatible, xAI)
```

Data flows through layered caching (Quote 24h → History permanent → Info 7d → News 4h) with multi-source fallback (Alpha Vantage → Yahoo Finance, RSS → Finnhub).

### Gateway

The `GatewayRouter` dispatches all incoming requests to the correct agent runtime:

| Source | Agent | Use Case |
|--------|-------|----------|
| Web UI | trading-agent | Interactive research & trading with guard rails |
| Discord | trading-agent | Chat-driven analysis via bot mentions |
| Cron | auto-trading-agent | Scheduled autonomous trading (every 30 min) |

### Plugin System

The AI runtime is built on composable plugins. Each plugin can provide system prompts, tools, and lifecycle hooks (`beforeChat` → `transformParams` → `afterChat`).

**Trading Agent** preset:
```
prompt → session → memory → skill → data → display → trading → research
```

**Auto-Trading Agent** preset:
```
heartbeat → auto-trading-prompt → session → memory → skill → auto-trading-tools
```

| Plugin | Responsibility |
|--------|---------------|
| prompt | Global system prompt + memory context |
| session | Chat session persistence + history truncation |
| memory | Vector search (pgvector) + transcript indexing |
| skill | Dynamic knowledge packages + bash sandbox |
| data | Market data tools (quotes, history, news, search) |
| display | UI rendering (rating cards, signal badges) |
| trading | Order execution with guard pipeline |
| research | Web search + deep research tools |
| heartbeat | Equity sync, order sync, baseline tracking, market status |
| auto-trading-prompt | Autonomous agent system prompt with live context |
| auto-trading-tools | Full order types without guard restrictions |

### Channels

All channels implement a shared `ChannelAdapter` interface and route through the same gateway:

- **Web** — HTTP streaming (SSE) via `/api/chat`
- **Discord** — Bot with slash commands, typing indicators, 2000-char message chunking
- **Cron** — Scheduled execution via `CronScheduler` engine

## API Overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | AI chat (streaming SSE) |
| GET/POST | `/api/brief` | Morning brief (cached / force refresh) |
| GET | `/api/dashboard` | Dashboard aggregate (portfolio, watchlist, brief) |
| GET | `/api/macro` | Macro indicators (SPY, QQQ, TLT, VIX) |
| GET/POST/DELETE | `/api/watchlist` | Watchlist CRUD |
| GET | `/api/stocks/:symbol/history` | OHLCV price history |
| GET | `/api/stocks/:symbol/info` | Company fundamentals |
| GET | `/api/stocks/:symbol/news` | News aggregation |
| GET | `/api/stocks/:symbol/position` | Open position from Alpaca |
| POST | `/api/stocks/:symbol/report` | AI research report |
| GET | `/api/stocks/:symbol/earnings/quarters` | Available earnings quarters |
| GET | `/api/stocks/:symbol/earnings` | L1 hard earnings data |
| POST | `/api/stocks/:symbol/earnings/analysis` | L2 AI earnings analysis |
| PUT | `/api/stocks/:symbol/earnings/transcript` | Upload earnings transcript |
| GET/DELETE/PATCH | `/api/sessions` | Chat session CRUD |
| GET | `/api/sessions/:id/messages` | Session message history |
| GET/POST/PUT/DELETE | `/api/memory` | Vector memory CRUD |
| GET | `/api/memory/search` | Semantic memory search |
| CRUD | `/api/cron` | Scheduled job management |
| POST | `/api/cron/:id/run` | Trigger job immediately |
| GET | `/api/health` | System health |

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16, React 19, Tailwind CSS v4, SWR, Recharts |
| Backend | Hono, Prisma 7, PostgreSQL, pgvector |
| AI | Vercel AI SDK, Anthropic, OpenAI-compatible, xAI |
| Trading | Alpaca API (paper trading) |
| Infra | Bun, Docker Compose, Biome |
| Testing | Bun Test, Playwright, MSW |

## Contributing

Contributions welcome — feel free to open issues and PRs.

## License

[Apache-2.0](LICENSE)
