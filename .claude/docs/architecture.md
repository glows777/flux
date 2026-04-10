# Flux 架构详细参考

> 按需阅读。核心指令见项目根 `CLAUDE.md`。

## Monorepo 目录结构

```
packages/
  shared/                   # @flux/shared — 跨包共享类型、schema、工具
    src/
      types/                # 通用类型定义 (含 PortfolioData, HoldingItem 等)
      schemas/              # Zod 校验 schema
      constants/            # 共享常量
      utils/                # 工具函数
      index.ts              # Barrel export
  server/                   # @flux/server — 后端 API 服务 (Hono + Prisma + AI Runtime)
    src/
      gateway/              # 请求网关
        router.ts           # GatewayRouter — 路由 chat 请求到对应 agent runtime
        heartbeat.ts        # HeartbeatMonitor — 子系统健康监控 + 自动恢复
      channels/             # 多渠道适配
        discord/            # Discord Bot (discord.js, slash commands, handlers, identity)
        types.ts            # 渠道抽象接口
      scheduler/            # 定时任务调度
        engine.ts           # CronScheduler — 基于 croner 的 cron 引擎
        executor.ts         # 任务执行器
        dedup.ts            # 任务去重
      core/                 # 业务逻辑核心
        ai/                 # AI 模块
          runtime/          # 统一 AI Runtime (create, execute, types, errors)
          plugins/          # 插件架构 (11 个插件)
            prompt/         # 基础 prompt
            auto-trading-prompt/ # 自动交易 prompt
            auto-trading-tools/  # 自动交易工具
            data/           # 市场数据访问
            display/        # 工具结果格式化
            heartbeat/      # 心跳监控
            memory/         # 记忆系统
            research/       # Web 搜索/抓取
            session/        # 会话管理
            skill/          # Bash 技能执行 (白名单)
            trading/        # 交易操作
          presets/          # 预设组合 (tradingAgentPreset, autoTradingAgentPreset)
          memory/           # 向量记忆系统 (chunker, embedding, search, store, vector-ops)
          research/         # 研究工具 (web-search, web-fetch, x-search)
          cache.ts          # AI 研报缓存
          prompts.ts        # 系统 prompt 模板
          providers.ts      # AI Provider 配置 (Claude/Gemini/xAI)
          session.ts        # 会话 CRUD
          tools.ts          # 通用 AI 工具
          trading-tools.ts  # 交易相关 AI 工具
          tool-display.ts   # 工具结果展示格式化
          tool-timeline.ts  # 工具调用时间线
        broker/             # 券商集成
          alpaca-client.ts  # Alpaca API 封装
          portfolio-calc.ts # 组合计算 (持仓映射, 汇总)
          guard.ts          # 安全约束
        trading-agent/      # 自动交易 Agent
          loop.ts           # 交易循环
          prompt.ts         # 交易 prompt
          tools.ts          # 交易工具
          pnl.ts            # 盈亏计算
          discord-hook.ts   # Discord 交易通知
        market-data/        # 市场数据 (facade, alpha-vantage, yahoo-finance, finnhub, sync, rss/)
        services/           # 服务层
          order-sync.ts     # Alpaca 订单同步 (WebSocket 实时)
        cron/               # Cron 服务
          service.ts        # CronJob CRUD + seedTradingHeartbeat()
        api/                # API 服务层 (watchlist.ts)
        db.ts               # Prisma 单例
        mock/               # Mock 数据
      routes/               # Hono 路由定义
      index.ts              # 服务入口 (初始化 Gateway, Heartbeat, Discord, Scheduler, OrderSync)
    prisma/
      schema.prisma         # 数据模型 (含 vector 扩展)
    __tests__/
      unit/                 # 单元测试
      integration/          # 集成测试 (各 API 端点, 含 finance L1/L2/transcript)
      e2e/                  # E2E 集成测试 (workflows, resilience, consistency)
  web/                      # @flux/web — Next.js 前端 (App Router + Turbopack)
    app/
      (app)/page.tsx        # Dashboard 页面
      (chat)/               # 聊天页面
      dev/                  # 开发工具页面 (Memory Inspector)
      layout.tsx            # 根布局 (Sidebar + Header + SWRProvider)
    components/
      charts/               # MiniChart 迷你图表
      chat/                 # 聊天系统 (ChatPage, ChatSessionSidebar, messages/)
      dashboard/            # Dashboard 视图 (Watchlist, StatCard, StatsGrid)
      detail/               # 详情视图 (PriceChart, MetricsGrid, NewsFeed, AICortex, tabs/)
      dev/                  # 开发工具 (MemoryInspector, DocEditor, DocTree, SearchBar)
      layout/               # 布局组件 (Sidebar, Header, Logo, NavIcon)
      market/               # 宏观指标组件 (MacroTickerItem)
      providers/            # SWRProvider
      ui/                   # 通用 UI (SearchBox, SignalBadge, Toast)
    lib/
      ai/                   # 前端 AI hooks
      mock/                 # 前端 Mock 数据
      api.ts                # Hono RPC 客户端 (hc<AppType>)
      fetcher.ts            # SWR fetcher (解包 { success, data } 信封)
      theme.ts              # 主题配置
    __tests__/
      unit/                 # 组件单元测试
      e2e/                  # Playwright E2E 测试 (浏览器级别)
docs/                       # 公开文档 (PRD, README 等)
.dev-docs/                  # 内部开发文档
  plans/                    # 实现计划
  specs/                    # 设计规格
  versions/                 # 版本设计文档
```

## API 端点 (Hono server，路由定义在 `packages/server/src/routes/`，前缀 `/api`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/macro` | 宏观指标 (SPY, QQQ, TLT, VIX) |
| GET | `/dashboard` | 聚合数据 (Portfolio + Watchlist + PositionSymbols) |
| GET | `/watchlist` | 自选股列表 |
| POST | `/watchlist` | 添加自选股 |
| DELETE | `/watchlist/:symbol` | 删除自选股 |
| GET | `/stocks/:symbol/history?period=` | 历史价格 (1W/1M/3M/6M/1Y/5Y) |
| GET | `/stocks/:symbol/info` | 公司基本面 |
| GET | `/stocks/:symbol/news?limit=` | 新闻 (RSS 优先, Finnhub 兜底) |
| POST | `/stocks/:symbol/report` | AI 研报 (带 24h 缓存) |
| GET | `/stocks/:symbol/position` | 当前持仓 (Alpaca) |
| GET | `/sessions` | 会话列表 |
| DELETE | `/sessions/:id` | 删除会话 |
| PATCH | `/sessions/:id` | 重命名会话 |
| GET | `/sessions/:id/messages` | 加载会话消息 |
| POST | `/chat` | 多渠道聊天 (经 GatewayRouter 路由到对应 runtime) |
| GET | `/memory` | 记忆文档列表 |
| POST | `/memory` | 创建记忆文档 |
| GET | `/memory/:path` | 读取记忆文档 |
| PUT | `/memory/:path` | 更新记忆文档 |
| DELETE | `/memory/:path` | 删除记忆文档 |
| GET | `/memory/search?q=&symbol=&limit=` | 向量语义搜索 |
| GET | `/cron` | Cron 任务列表 |
| POST | `/cron` | 创建 Cron 任务 |
| PUT | `/cron/:id` | 更新 Cron 任务 |
| DELETE | `/cron/:id` | 删除 Cron 任务 |
| POST | `/cron/:id/run` | 手动触发 Cron 任务 |
| GET | `/health` | 子系统健康状态 |

## 数据模型 (Prisma)

- `Watchlist` — 自选股列表
- `StockQuote` — 实时报价缓存 (24h TTL)
- `StockHistory` — 历史 OHLCV 数据 (增量存储)
- `StockHistoryCoverage` — 历史数据覆盖范围追踪
- `StockInfo` — 公司基本面 (7d TTL)
- `AIReport` — AI 研报缓存 (24h TTL)
- `NewsArticle` — 新闻缓存 (4h TTL, URL 唯一去重)
- `StockSearchQuery` — AI 生成的搜索词缓存 (30d TTL, 含中文名/板块/搜索词)
- `ChatSession` — AI 对话会话 (支持 web/discord/cron 多渠道, 可选绑定 symbol)
- `ChatMessage` — 会话消息 (JSON 序列化 UIMessage, sessionId+messageId 去重)
- `MemoryDocument` — 记忆文档 (path 唯一, evergreen 标记)
- `MemoryChunk` — 记忆分块 + 向量嵌入 (vector(768), entities GIN 索引)
- `CronJob` — 定时任务 (cron 表达式, taskType, 渠道目标, 执行状态追踪)
- `Order` — 交易订单 (Alpaca Paper Trading, 含 side/qty/type/status/filledAvgPrice/reasoning)
- `TradingAgentConfig` — Trading Agent 不可篡改配置 (如 baseline equity)

## 服务启动流程 (`packages/server/src/index.ts`)

1. HeartbeatMonitor 初始化 (discord/scheduler/database 三子系统监控)
2. AI Runtime 创建 (tradingAgentPreset + autoTradingAgentPreset, 双运行时)
3. OrderSync 启动 (Alpaca WebSocket 实时订单状态同步)
4. GatewayRouter 初始化 (路由 chat 请求到 trading-agent 或 auto-trading-agent runtime)
5. Discord Bot 启动 (可选, 依赖 DISCORD_BOT_TOKEN)
6. CronScheduler 启动 + seed 交易心跳任务
7. Hono HTTP API 启动 (默认 3001 端口)
8. Heartbeat 监控开始 + DB ping (60s 间隔)
9. Graceful shutdown 注册

## 数据流

1. **前端** → SWR + fetcher 调用 `/api/*`
2. **API 层** (Hono routes) → 调用业务逻辑
3. **Chat 流** → GatewayRouter → AI Runtime (plugin 组合) → 流式响应
4. **业务逻辑** → `sync.ts` 分层缓存策略 (先查 DB 缓存，过期则调外部 API)
5. **外部数据源** → MarketDataFacade (Alpha Vantage → Yahoo Finance 兜底) / RSS / FMP API / AI Provider / Tavily / xAI / Alpaca
6. **数据持久化** → Prisma → PostgreSQL (含向量存储)

## 关键设计模式

- **Gateway + 双运行时**: GatewayRouter 将请求分发到 `trading-agent` (交互式) 或 `auto-trading-agent` (自主定时) 运行时
- **Plugin 架构**: AI Runtime 基于 preset 组合插件 (prompt/data/memory/research/trading/session/display/skill/heartbeat), 可热插拔
- **多渠道适配**: Channel 抽象 (web/discord/cron), 统一消息处理, 各渠道独立 identity/auth
- **子系统心跳**: HeartbeatMonitor 追踪 discord/scheduler/database 健康, 超时自动恢复, 限速重启
- **向量记忆**: MemoryDocument → MemoryChunk (分块 + embedding), 支持语义搜索, portfolio 自动同步
- **Facade + Fallback**: MarketDataFacade 自动从 Alpha Vantage 降级到 Yahoo Finance (5s 超时)
- **三级新闻降级**: RSS (Google News CN/TW/HK + RSSHub 格隆汇/华尔街见闻/财联社) → Finnhub → 过期 DB 缓存
- **AI 搜索词生成**: 首次查询时由 AI 生成中文名/板块/搜索关键词，缓存 30d，支持歧义消歧
- **分层缓存**: Quote (24h), History (永久+增量), Info (7d), News (4h), SearchQuery (30d), Report (24h), Earnings (reportDate+100d), Brief (日级), Memory (永久)
- **批量写入**: 新闻入库使用 `createMany + skipDuplicates` + `updateMany` 替代逐条 upsert
- **依赖注入**: 所有服务模块通过 `deps` 参数支持测试替换
- **端到端类型安全**: Hono RPC 客户端 (`hc<AppType>`) 确保前后端类型一致
- **L1/L2 拆分**: L1 硬数据秒回 (FMP 并行拉取), L2 AI 分析异步加载 (transcript → AI)
- **Transcript 降级**: FMP API → 用户手动上传 → 404 (三级 fallback)
- **Fiscal Quarter 导出**: 季度选择器从 FMP income-statement 动态获取, 避免 calendar/fiscal 季度错配 (如 NVDA fiscal Q1=Apr-Jul)
- **OrderSync**: Alpaca WebSocket 实时同步订单状态到 DB + Discord 通知

## 第三方依赖

### 前端
- `lucide-react` — 图标
- `recharts` — 图表 (Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis)
- `swr` — 数据请求/缓存
- `react-markdown` + `remark-breaks` — Markdown 渲染
- `react-resizable-panels` — 可调节分割面板
- `@radix-ui/react-dropdown-menu` + `@radix-ui/react-select` + `@radix-ui/react-tooltip` — 无障碍 UI 原语
- `@ai-sdk/react` — AI SDK React hooks (useChat 等)
- `Tailwind CSS v4` — 样式

### 后端
- `hono` + `@hono/standard-validator` — API 路由框架 + 请求校验
- `prisma` v7 + `@prisma/adapter-pg` + `pg` — ORM + PostgreSQL 驱动 (含 vector 扩展)
- `ai` (Vercel AI SDK) + `@ai-sdk/openai` + `@ai-sdk/anthropic` + `@ai-sdk/xai` — 多 Provider AI Runtime
- `@tavily/core` — Web 搜索 API
- `@alpacahq/alpaca-trade-api` — Alpaca Paper Trading
- `discord.js` — Discord Bot 框架
- `croner` — Cron 表达式调度
- `bash-tool` + `just-bash` — Bash 技能执行
- `turndown` — HTML → Markdown 转换
- `yahoo-finance2` — Yahoo Finance 数据源
- `fast-xml-parser` — RSS XML 解析
- `undici` — 代理 HTTP 客户端
- `zod` — 输入校验
- `dotenv` — 环境变量

### 测试
- `bun test` — 单元/集成测试
- `@playwright/test` — E2E 测试
- `msw` — API Mock
- `@testing-library/react` + `happy-dom` — 组件测试

## UI 规范

设计系统: 深色主题, 背景 `#030303`, 强调色 emerald (翡翠绿), sans-serif
全局氛围: 模糊光晕 (emerald-900/5, slate-800/10) + 噪点纹理 (opacity 3%)

### 页面结构
1. **侧边栏导航** (w-16 md:w-20) — Logo, 导航图标 (Home/BarChart2/Globe/Layers), 底部 (Bell/Settings/头像)
2. **顶部宏观行情栏** (h-16) — 标普500/比特币/十年美债/恐慌指数 + 搜索框 (Cmd+K)
3. **Dashboard 视图** — AI 简报 + 统计卡片 (总资产/今日盈亏/风险评分) + 自选股列表 (带 MiniChart)
4. **Detail 视图** — 左 8/12 (主图表/指标卡片/持仓/新闻) + 右 4/12 (AI 面板: 研报/问答)
5. **Chat 视图** — 会话列表侧栏 + 聊天主区域 (工具结果可视化)
6. **Dev 视图** — 记忆文档管理 + 语义搜索

### 组件列表
- **布局**: `Sidebar`, `Header`, `Logo`, `NavIcon`
- **Dashboard**: `DashboardContent`, `StatsGrid`, `StatCard`, `Watchlist`, `WatchlistItem`, `AddWatchlistInput`
- **Dashboard Brief**: `BriefSkeleton`, `SpotlightCard`, `CatalystList`
- **Detail**: `DetailView`, `PriceChart`, `PeriodButton`, `MetricsGrid`, `MetricCard`, `NewsFeed`, `NewsItem`, `AICortex`, `TabButton`, `ContextInput`, `PositionCard`
- **Detail Tabs**: `ReportTab`, `ChatTab`
- **Finance**: `QuarterSwitcher`, `L1Section`, `L2Section`
- **Chat**: `ChatPage`, `ChatSessionSidebar`, `ChatSessionItem`, `ChatWelcome`
- **Chat Messages**: AssistantMessage, UserMessage, ToolResult 可视化组件
- **Dev**: `MemoryInspector`, `DocEditor`, `DocTree`, `DocTreeGroup`, `DocTreeItem`, `DocViewer`, `DocMeta`, `DocPreview`, `CreateDocDialog`, `ConfirmDialog`, `SearchBar`, `SearchResultCard`, `SearchResults`
- **图表**: `MiniChart`
- **宏观**: `MacroTickerItem`
- **通用 UI**: `SearchBox`, `SignalBadge`, `Toast`
- **Provider**: `SWRProvider`

详细 UI 实现参照 `.dev-docs/versions/v0.01/prd.tsx`。
