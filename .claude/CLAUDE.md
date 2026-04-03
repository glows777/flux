# CLAUDE.md

## 行为约束

### 设计与架构讨论 — 先验证理解，再提方案

涉及架构设计、系统重构、新功能设计时，**禁止直接给方案**。必须先完成以下步骤:

1. 读取相关源码文件（不要凭假设）
2. 向我陈述你的理解:
   - 你认为当前系统**是什么结构**、**怎么运作的**
   - 你认为我**想改什么**、**为什么要改**
   - 你**假设了哪些约束**（向后兼容？性能？渐进式？）
3. 等我确认或纠正后，再提方案

我会纠正你理解错误的部分。纠正完成后你再设计。这比你猜错后返工 3 轮要快得多。

**反面案例**（历史上反复出现的问题）:
- 混淆 Discord DM 和 Guild 渠道，提出错误的消息路由方案
- 在 runtime 合并讨论中错误假设组件职责映射
- 不看代码就提出 "实时轮询同步" 这种明显不合理的方案
- 删除非 Claude 模型的配置选项（本项目支持 Claude/Gemini/xAI 多 Provider）

### 设计文档 / Spec — 必须写清楚 "Why"

写 spec 或设计文档时，**"为什么这么设计"是最重要的部分**。要求：

1. **是因果链，不是会议纪要** — 不要写"我们讨论了 X"，要写"因为发现了 X，所以推导出 Y"
2. **推理必须展开** — 禁止写"分析后发现"、"推演到极致"等黑箱表述。遇到分析/评估/排查时，用具体工具展开（排查表、时间线、方案对比表）
3. **调研嵌入问题节点** — 如果在推导中需要做社区调研，在遇到问题的位置就地展开：调研了什么 → 各方案对比 → 为什么选了这个。不要单独列"调研"章节
4. **一个月后测试** — 写完后问：一个月后没有上下文地读这篇文档，能否仅凭文档重建每个决策的 WHY？

完整方法论见 `.claude/docs/design-doc-methodology.md`，实例见 `.dev-docs/versions/v0.0.17/memory-v2-analysis.md`。

### 执行类任务 — 直接做，不要反复确认

Git 操作（commit/push/PR/branch cleanup/tag）、代码修改、测试运行等执行类任务，收到确认后直接执行。不要在每个步骤都停下来问"要继续吗？"。

用户回复 "可以"、"是的"、"ok"、"好"、"做吧" 等均为明确的执行指令，立即执行。

唯一需要额外确认的场景: 不可逆操作（force push、删数据库、删文件）。

### Worktree 合并 — 退出后本地 merge，不要走 PR

在 worktree 中完成工作后，合并回 main 的流程:

1. `ExitWorktree` 退出 worktree → 回到主仓库（main 已 checkout）
2. `git merge <worktree-branch>` 本地合并
3. `git push` 推送

**不要**在 worktree 里 push 分支再创建 PR 合并 — 这是不必要的绕路。worktree 里无法 `checkout main`（被主仓库占用），但退出后就能直接本地 merge。

### Discord — Bot + Channel 推送

Bot 监听 @mention 消息 → GatewayRouter 处理 → 回复。推送通过 `DiscordAdapter.send(target, message)` 发送到指定 `channelId`。配置: `DISCORD_BOT_TOKEN` 环境变量 (Bot 登录) + CronJob 的 `channelTarget.channelId` (推送目标)。

## 开发偏好

- **包管理器/运行时**: bun
- **AI 工具**: 只使用 Claude Code + Codex，安装 skills 时必须指定 `--agent claude-code codex`
- **UI 实现**: 1:1 对照 `.dev-docs/versions/v0.01/prd.tsx`，深色主题 (`#030303`), emerald 强调色
- **PRD 同步**: 功能变更必须同步更新 `docs/PRD.md`
- **文档路径**:
  - `.dev-docs/` — Superpowers 工作目录（`specs/` 存 spec，`plans/` 存 plan，`versions/` 存版本设计含 prd.tsx）
  - `.dev-docs/bug-report/` — Bug 追踪，记录已发现但尚未修复的 bug（编号递增 `NNN-slug.md`，含严重度、状态、文件定位、影响分析、修复方向）
  - `.claude/docs/` — Claude Code 参考文档 (架构详情、API 端点、数据模型等)
  - `docs/` — 面向开源的公开文档 (README、PRD 等)，**仅此目录会被 git 追踪**

## 架构概要

三包 monorepo: `@flux/shared` (类型/schema) + `@flux/server` (Hono API + AI Runtime, 端口 3001) + `@flux/web` (Next.js 前端, 端口 3000, 通过 `NEXT_PUBLIC_SERVER_URL` 连接 server)

技术栈: Next.js 16 + Hono + Prisma 7 (PostgreSQL + vector 扩展) + Vercel AI SDK + Bun

关键子系统:
- **AI Runtime**: Plugin 架构 (11 插件 + preset 组合), GatewayRouter 双运行时 (`trading-agent` 交互式 / `auto-trading-agent` 自主定时)
- **市场数据**: MarketDataFacade (Alpha Vantage → Yahoo Finance 兜底), RSS 三级降级, FMP 财报
- **交易**: Alpaca Paper Trading, OrderSync (WebSocket 实时), Discord 通知
- **多渠道**: Web + Discord + Cron, 统一 Channel 抽象, 各渠道独立 identity
- **记忆系统**: MemoryDocument → MemoryChunk + vector(768) 语义搜索
- **调度**: CronScheduler (croner), HeartbeatMonitor (discord/scheduler/database 健康监控 + 自动恢复)

完整目录结构、API 端点表、数据模型、设计模式、UI 规范、依赖列表见 `.claude/docs/architecture.md`。

## 关键依赖约束

| 场景 | 用什么 | 不要用 |
|------|--------|--------|
| 图表 | `recharts` | chart.js, d3, visx |
| Cron 调度 | `croner` | node-cron, node-schedule |
| 路由校验 | `@hono/standard-validator` + `sValidator` + `zod` | hono 内置 validator |
| HTML → Markdown | `turndown` | 手写正则, cheerio |
| 外部 HTTP 请求 | `proxyFetch` (见 `proxy-fetch.ts`) | `fetch`, `Bun.fetch`, `axios` |

## 注意事项

- **禁止 git add 的文件（硬性约束）**

  **禁止列表:** `.env*`（除 `.env.*.example`）、`.claude/worktrees/`、`.dev-docs/`、`docs/bug-report/`、`docs/superpowers/specs/`、`docs/superpowers/plans/`

  **强制执行规则:**
  1. **Superpowers spec/plan 文件必须写到 `.dev-docs/`**，不是 `docs/superpowers/`。brainstorming 和 writing-plans skill 的默认路径已被本项目覆盖为 `.dev-docs/specs/` 和 `.dev-docs/plans/`
  2. **每次 `git commit` 前必须运行 `git diff --cached --name-only`**，检查是否包含禁止文件。发现后立即 `git reset` 移除
  3. **禁止 `git add -A` 和 `git add .`**，必须用 `git add <具体文件路径>`
  4. **dispatch subagent 时必须在 prompt 中包含以下提醒:**
     > IMPORTANT: 禁止 git add 以下路径: `.dev-docs/`, `.env*`, `.claude/worktrees/`, `docs/bug-report/`, `docs/superpowers/specs/`, `docs/superpowers/plans/`。只 add 你创建/修改的源码和测试文件。用 `git add <具体文件>` 而非 `git add -A`。commit 前用 `git diff --cached --name-only` 检查。
  5. **spec reviewer 必须检查 commit 是否包含禁止文件** — 这是 spec compliance 的一部分
- **每次改动后必须全量测试通过** — `bun run test:all`。若新增/修改模块导出，必须同步更新测试 mock（`packages/server/__tests__/{integration,e2e}/{setup.ts,helpers/mock-boundaries.ts}`）
- **Prisma 用 `db push`，不要用 `migrate dev`** — 无 migration 文件，混用报 drift 错误。新增模型: `bun run db:push && bun run db:generate`
- **全量测试用 `bun run test:all`，不要裸跑 `bun test`** — 集成/E2E 需通过 npm script 注入 `flux_test` 数据库 URL
- **Plan 模式必须遵守 `.claude/learned/verify-third-party-api-before-planning.md`** — 涉及第三方 API/库时，先查文档再设计
- **测试后关闭服务** — 完成测试后必须关闭 web (端口 3000) 和 server (端口 3001) 服务（`lsof -ti :3000 -ti :3001 | xargs kill -9`）。真实测试（集成/E2E）执行时需要先启动 web 和 server
