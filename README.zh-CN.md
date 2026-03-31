<div align="center">
  <img src="docs/assets/logo.png" alt="Flux Logo" width="120" />
  <h1>Flux</h1>
  <p><strong>自我进化的 AI 交易代理</strong></p>
  <p>一个通过实盘实验自主发现交易策略的自主代理，
  由全栈金融情报平台驱动。</p>
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
  <p><a href="README.md">English</a> | <strong>中文</strong></p>
</div>

> [!WARNING]
> **Flux 目前处于非常早期的开发阶段。** API、数据库结构和配置格式随时可能发生破坏性变更（breaking changes），且不会提前通知。这是一个尚不成熟的实验性项目，请谨慎使用。

## 为什么选择 Flux

- **策略自涌现，而非人为编写** — 灵感来自 Karpathy 的 autoresearch loop。代理通过实际交易不断撰写并进化自身的 `strategy.md`，而非依赖人工制定的规则。
- **信号优于噪声** — 多层市场数据（Alpha Vantage → Yahoo → RSS → Finnhub）结合 AI 驱动分析，只呈现对决策真正有价值的信息。
- **自托管，数据私有** — 你的数据、你的密钥、你的基础设施。执行 `docker compose up` 即可完整掌控一切。

## 功能特性

**自主交易**
- 交易时段内每 30 分钟触发一次心跳循环，代理自主分析、交易并记录日志
- 自我进化的策略文件，代理自行撰写、测试并迭代优化规则
- FIFO 盈亏核算，每笔交易的决策理由持久化存储至数据库
- 完整订单类型支持：市价单、限价单、止损单、止损限价单、追踪止损（Alpaca 模拟交易）
- 每笔交易触发 Discord 通知

**金融情报**
- 实时报价、6 周期价格图表、公司基本面数据
- 多源新闻聚合（RSS + Finnhub，三级降级策略）
- AI 研究报告，带 24 小时缓存（Gemini）
- 财报分析：L1 硬数据（FMP）+ L2 AI 深度分析（财报电话会议记录 → Gemini）

**AI 基础设施**
- 插件化运行时——提示词、会话、记忆、工具、交易均以可组合插件形式接入
- Agentic 工具调用——代理自主获取数据、执行搜索和下单操作
- 向量记忆（pgvector）——跨会话的 RAG 知识检索
- 多模型支持（Anthropic、OpenAI 兼容协议、xAI）
- 交互式 Copilot 模式——对话驱动的分析与交易，内置安全护栏

**平台**
- Monorepo 架构：Next.js 16 前端 + Hono API 服务 + 共享类型
- 基于 Hono RPC 客户端的端到端类型安全
- Cron 调度器，用于心跳循环与每日早报
- 多渠道接入：Web + Discord 机器人

## 快速开始

```bash
git clone https://github.com/glows777/flux.git
cd flux
cp .env.example .env
# Edit .env with your API keys

docker compose up -d
```

打开 `http://localhost:3000`，仪表盘即可使用。

自动交易代理会在美股交易时段自动启动心跳循环。

## 开发

```bash
bun install
docker compose up -d db       # PostgreSQL only
bun run db:push               # Push schema
bun run db:generate           # Generate Prisma client
bun run dev                   # Next.js :3000 + Hono :3001
```

```bash
bun run test:all              # Unit + integration + E2E
bun run lint                  # Biome check
```

## 架构

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

数据流经分层缓存体系（报价 24h → 历史永久 → 基本面 7d → 新闻 4h），并配备多源降级策略（Alpha Vantage → Yahoo Finance，RSS → Finnhub）。

### 网关

`GatewayRouter` 将所有传入请求分发到对应的 Agent 运行时：

| 来源 | Agent | 用途 |
|------|-------|------|
| Web UI | trading-agent | 交互式研究与交易，带安全护栏 |
| Discord | trading-agent | 通过 Bot 对话驱动分析 |
| Cron | auto-trading-agent | 定时自主交易（每 30 分钟） |

### 插件系统

AI 运行时基于可组合插件构建。每个插件可提供系统提示词、工具和生命周期钩子（`beforeChat` → `transformParams` → `afterChat`）。

**Trading Agent** 预设：
```
prompt → session → memory → skill → data → display → trading → research
```

**Auto-Trading Agent** 预设：
```
heartbeat → auto-trading-prompt → session → memory → skill → auto-trading-tools
```

| 插件 | 职责 |
|------|------|
| prompt | 全局系统提示词 + 记忆上下文 |
| session | 会话持久化 + 历史消息截断 |
| memory | 向量搜索 (pgvector) + 对话记录索引 |
| skill | 动态知识包 + bash 沙箱执行 |
| data | 市场数据工具（报价、历史、新闻、搜索） |
| display | UI 渲染（评级卡片、信号徽章） |
| trading | 订单执行 + 风控守卫管线 |
| research | 网络搜索 + 深度研究工具 |
| heartbeat | 净值同步、订单同步、基准跟踪、市场状态 |
| auto-trading-prompt | 自主代理系统提示词 + 实时上下文 |
| auto-trading-tools | 完整订单类型，无风控限制 |

### 渠道

所有渠道实现统一的 `ChannelAdapter` 接口，通过同一网关路由：

- **Web** — HTTP 流式传输 (SSE)，通过 `/api/chat`
- **Discord** — Bot 支持斜杠命令、输入指示器、2000 字符消息分片
- **Cron** — 通过 `CronScheduler` 引擎定时执行

## API 概览

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

## 技术栈

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16, React 19, Tailwind CSS v4, SWR, Recharts |
| Backend | Hono, Prisma 7, PostgreSQL, pgvector |
| AI | Vercel AI SDK, Anthropic, OpenAI-compatible, xAI |
| Trading | Alpaca API (paper trading) |
| Infra | Bun, Docker Compose, Biome |
| Testing | Bun Test, Playwright, MSW |

## 贡献

欢迎贡献代码——欢迎提交 Issue 和 PR。

## 许可证

[Apache-2.0](LICENSE)
