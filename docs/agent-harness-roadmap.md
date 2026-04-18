# Flux Agent Harness Roadmap

> 定位：这是一份针对 Flux 的 agent harness roadmap。它只讨论 agent loop 这一层如何被组织、约束、延续、观测和恢复，不讨论交易决策工作流，也不讨论交易系统的长期学习与策略进化。
>
> 文档类型：这是一份 capability roadmap，不是架构口号，也不是实现 checklist。
>
> 最后更新：2026-04-18

---

## 1. 先把这份文档写成真正的 roadmap

上一版更像一份架构立场说明，讲清楚了很多判断，但还不够像 roadmap。

一份像 roadmap 的文档，至少要回答六件事：

- 我们现在到底站在哪里
- 终态到底长什么样
- 为什么按这个顺序推进
- 每个阶段交付什么、依赖什么、什么时候算完成
- 迁移怎么做，怎样避免一次性爆改
- 怎么验证这条路是不是走对了

这次重写的目标，就是把这六件事补齐。

这里也先说明一个边界：这份文档先做成 **按里程碑推进的 roadmap**，不是按季度死排的排期表。原因很简单，现在 Flux 在这条线上最缺的不是“日期”，而是“依赖顺序”和“退出标准”。等 owner、资源和并行度稳定以后，再把这些里程碑挂到季度上，会比现在硬填日期更可信。

---

## 2. 这条 roadmap 只处理哪一层

Flux 现在有两条不同的 harness 主线。

第一条是 [harness-roadmap.md](/Users/glows777/codes/wcg/flux/docs/harness-roadmap.md) 讨论的那层，也就是 `Trading-System Harness`。它关心的是：

- 交易系统怎么控制自己
- 结果怎么被解释和吸收
- 策略什么时候允许演化

第二条就是这份文档讨论的 `Agent Harness`。它关心的是：

- agent 一轮请求怎么开始、怎么推进、怎么结束
- 上下文怎么组装、压缩、缓存
- session 和状态怎么延续
- tools、权限、观测、恢复怎么被组织

这两层不是同一件事，而且顺序不能反。

如果底下这层 agent harness 还没有立住，后面的 trading-system harness 就会一直建在不稳定的运行时之上。那时即使上层策略设计得再完整，也会被底层的上下文膨胀、cache miss、history 失忆、provider 差异和缺乏观测拖住。

所以顺序先锁死：

**先把 Agent Harness 做完整，再让 Trading-System Harness 长在它上面。**

---

## 3. 当前系统快照

### 3.1 现在已经有的主链路

Flux 不是从零开始，底下已经有一个能跑的 agent runtime。

当前主链路主要在这些文件里：

- [create.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/runtime/create.ts) 负责 runtime factory 和 `chat()` 主链路
- [execute.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/runtime/execute.ts) 负责 hook 执行与收集
- [router.ts](/Users/glows777/codes/wcg/flux/packages/server/src/gateway/router.ts) 负责把 gateway 输入转成 runtime 输入
- [gateway.ts](/Users/glows777/codes/wcg/flux/packages/server/src/gateway/gateway.ts) 负责 conversation / trigger 两种执行模式

按现在的代码看，一轮 run 的事实链路大致是：

1. `beforeChat`
2. 收集 `systemPrompt` 和 `tools`
3. `transformMessages`
4. `transformParams`
5. `streamText`
6. `consumeStream` 或 web route `onFinish`
7. `finalize`
8. `afterChat` / `onError`

这说明一件事：**runtime 已经是唯一编排中心**。这点不需要推翻。

### 3.2 现在真正的问题

问题不是没有 runtime，而是现在这套 runtime 还太薄，很多本来应该属于 harness 的能力，仍然散在 plugin 和隐式约定里。

最明显的几个缺口是：

- `Context Management`
  现在主要还是最近 `20` 条消息截断，每轮重新组 prompt，没有正式的 budget、compaction、cache 策略。

- `State & Session`
  现在有 session 和记忆，但还没有 summary state、continuation state、checkpoint 所依赖的正式对象。

- `Tools & Permissions`
  现在有 tool registry，也有一部分 guard，但还没有正式的 action / permission surface。

- `Telemetry & Recovery`
  现在能拿到 basic usage，但没有 segment 级观测、cache hit/miss、compaction 事件、failure path 和恢复信号。

- `Environment Boundaries`
  `web / discord / cron` 的差异还混在 gateway、router、session plugin 里，没有单独的 adapter contract。

### 3.3 现在最危险的隐含耦合

比“缺模块”更麻烦的，是现有代码里已经有几条隐含耦合。

- `sessionPlugin` 的 [beforeChat](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/plugins/session/index.ts) 不只是交 history，它还负责建 session、解 session、落最后一条 user message、清 error。
- `heartbeatPlugin` 的 [beforeChat](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/plugins/heartbeat/index.ts) 不只是交 live context，它还会拉账户、同步订单、seed strategy。
- plugin 顺序本身在承担语义，比如 `heartbeatPlugin` 要先往 `ctx.meta` 写 heartbeat，`autoTradingPromptPlugin` 才能接着读。
- 一轮 run 其实不只有一个“结束时刻”。
  `streamText` 结束是一层，`responseMessage` 流完是一层，`afterChat` 落库结束又是一层。
- risky actions 的约束现在一部分在 tool 内部，比如 [trading-tools.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/trading-tools.ts) 里的 guard；另一部分在 UI 语义里，比如 [tool-timeline.ts](/Users/glows777/codes/wcg/flux/packages/web/lib/ai/tool-timeline.ts) 已经有 `approval-requested` / `approval-responded` 这种状态名。

这些耦合不会因为新建一个 `harness/` 目录就自动消失。roadmap 如果不正面处理它们，后面一定会在 phase 边界上打架。

---

## 4. 这份 roadmap 参考了哪些外部实践

这次重写不是凭感觉排阶段，外部基线主要参考了四类资料：

- OpenAI 的 agent 实践，重点看 run loop、tools、guardrails、state、tracing、evaluation 这些一线概念
- Anthropic 的 context management 实践，重点看 prompt caching、compaction、context editing、memory 配合方式
- LangGraph 的 durable execution 实践，重点看 checkpoints、interrupts、resume、fault tolerance
- 一般技术 roadmap 的写法，重点看目标、里程碑、依赖、风险、KPI、持续更新机制

从这些资料里，能提炼出几条对 Flux 很直接的结论。

### 4.1 runtime 继续做唯一编排中心

OpenAI 在 agent guide 里把 run loop、state、guardrails、tools 都放在同一条 agent runtime 叙事里，而不是额外再套一个 orchestrator。对 Flux 来说，这正好对应当前现实：runtime 已经存在，下一步不是再造第二个 planner，而是把 runtime 原生能力补齐。

### 4.2 tools、approvals、state、observability 不能后置成“以后再补”

OpenAI 的 Agents SDK 文档把 `running agents`、`guardrails`、`results and state`、`integrations and observability` 放在同一条成长路径里；Anthropic 的 Claude Code SDK 也把 permissions、session management、monitoring 当成 production essentials。这个信号很明确：

**只把 model loop 跑通，不算 harness；action control、state continuity、traceability 都是 harness 的一部分。**

### 4.3 context management 不能只靠字符串拼接

Anthropic 在 prompt caching、compaction、context editing 这些文档里给出的方向很一致：

- cache 需要围绕稳定前缀设计
- tools、system、messages 的层级变化会直接影响 cache 命中
- heavy tool use 的长期任务，不能一直把旧 tool results 留在活跃上下文里
- compaction 要么交给 provider-native 机制，要么自己维护 summary / durable memory 的落点

这意味着 Flux 的 Phase 1 不能只做 `PromptManifest`，还得一起立最小 durable state，不然 compaction 只会变成一次性裁剪。

### 4.4 recovery 的前提不是“有日志”，而是“有 checkpoint 和可恢复边界”

LangGraph 在 persistence、durable execution、interrupts 里强调得很清楚：

- human review、pause/resume、fault tolerance 都依赖 checkpoint
- side effects 要和可恢复 state 明确分开
- run 可以暂停，但恢复时不能重复执行已经成功的副作用

这对 Flux 的直接影响是：

- `tool execution`
- `delivery`
- `persistence`

这三层不能混成一个完成状态；否则恢复点会一直不稳定。

### 4.5 roadmap 要写目标、依赖、风险和退出标准

Atlassian 对 technology roadmap 的定义很朴素，但对这次重写很有用：roadmap 不是一串理念，而是要把 `objectives / timelines / milestones / dependencies / risks / KPIs` 都说清楚。上一版文档最缺的，就是这些“真正在推进时要拿来判断先后和是否完成”的东西。

---

## 5. 核心判断不变，但表达方式要更工程化

这份 roadmap 最重要的判断还是这一句：

**Agent Harness 不是 runtime 外再套一层壳，而是现有 runtime 的下一阶段形态。**

但这句话不能只停在观点层，得落成真正的工程原则。

### 5.1 原则一：runtime 继续是唯一编排中心

不引入第二个 orchestrator，不在 runtime 外再造 planner。

### 5.2 原则二：先立运行契约，再做能力叠加

先把 run 的阶段、完成语义、trace 边界、兼容层定义清楚，再往上长 context、permissions、recovery。否则每加一个新能力，都会改一次主链路。

### 5.3 原则三：先有最小 durable state，再上 aggressive compaction

没有 summary / continuation / checkpoint 的 compaction，只是裁剪，不是真正的连续性管理。

### 5.4 原则四：tools 要分类型，actions 要带风险语义

至少要明确区分：

- 只读数据类
- 研究与外部抓取类
- 展示与格式化类
- 写入与交易动作类

否则 permission model 永远长不出来。

### 5.5 原则五：trace 先分层，再谈 recovery 和 eval

至少要把下面几层分开：

- planning
- model execution
- tool execution
- delivery
- persistence

不然 telemetry 看起来很多，实际上还是黑箱。

### 5.6 原则六：不做 big-bang rewrite

现有 `systemPrompt / transformMessages / transformParams / ctx.meta` 这些路径不能一刀切掉，必须先有兼容带，再逐步迁移。

---

## 6. 北极星结果

这条 roadmap 的终态，不是多一个 `harness/` 目录，而是 runtime 自己长出下面五个结果。

### 6.1 run model 明确

任何一轮请求都能回答：

- 这轮是怎么开始的
- 当前处在哪个阶段
- 什么事件算 run 完成
- 什么事件只算 delivery 完成
- 哪里可以 resume

### 6.2 context 不再是一坨字符串

任何一轮请求都能回答：

- 这轮上下文由哪些段组成
- 哪些段是稳定前缀
- 哪些段可以缓存
- 哪些段可以清理或压缩
- 压缩后的连续性落到哪里

### 6.3 tools 不再只是 registry

任何一个 tool call 都能回答：

- 为什么此刻可用
- 它属于什么风险级别
- 是否需要 guard / approval / deny
- 它被拒绝时会怎样反馈到 trace 和 UI

### 6.4 state 不再只是 history 列表

任何一个 session 都能回答：

- 当前 identity 是什么
- recent history 是什么
- summary / continuation state 是什么
- 上一次安全恢复点在哪

### 6.5 recovery 不再靠猜

任何一次失败都能回答：

- 失败发生在哪个阶段
- 哪些副作用已经执行
- 哪些步骤需要重试
- 从哪个 checkpoint 恢复最安全

---

## 7. 能力面怎么拆

这条 roadmap 里，能力不是按目录名堆起来，而是按 workstream 拆。

### 7.1 Execution Kernel

这一面就是 runtime 自己，负责：

- 生命周期
- step policy
- 模型调用
- finalize / afterChat / onError
- run completion semantics

### 7.2 Context & State

这一面负责：

- contributions
- manifest / plan
- budget / cache / compaction
- session identity
- summary / continuation / checkpoint

这里故意把 `context` 和 `state` 放在一起，因为它们在工程上不是干净的上下游，而是一组强依赖。

### 7.3 Tools & Permissions

这一面负责：

- tool availability
- action classification
- mode-level gating
- approval / deny / escalation
- tool-side guard 和 runtime-side policy 的衔接

### 7.4 Telemetry & Recovery

这一面负责：

- trace schema
- planning / execution / delivery / persistence 分层
- cache / compaction / tool 调用观测
- failure classes
- replay / resume / recovery signals

### 7.5 Environment Adapters

这一面负责吸收运行环境差异。

在 Flux 里，它不是 shell/workspace，而是：

- `web`
- `discord`
- `cron`
- `conversation`
- `trigger`

它不负责业务策略，只负责把不同入口统一变成 agent loop 可以消费的输入和输出边界。

---

## 8. Roadmap 总览

下面这张表先给出整条路的骨架。

| Window | Milestone | 主题 | 为什么现在做 | 退出标准 |
| --- | --- | --- | --- | --- |
| Now | M0 | Run contract 与迁移带 | 先把阶段、边界和兼容层立住，不然后面每一步都会返工 | 所有 run 都能产出统一 trace skeleton，旧 plugin 不需要一次性重写 |
| Now | M1 | Structured context + thin durable state | context planning 要和最小 state 一起立，不然 compaction 没落点 | `PromptManifest / PromptPlan / SummaryState / CheckpointRef` 成型，cache 与 compaction 可量化 |
| Next | M2 | Tools & permissions as control surface | risky action 不能继续散在 tool 实现和 UI 名字里 | tool risk、availability、approval、deny 成为 runtime 合同的一部分 |
| Next | M3 | Telemetry, replay, recovery | 没有失败路径和 resume 语义，就谈不上长期运行 | planning/tool/delivery/persistence 分层可观测，失败可解释，恢复可复现 |
| Later | M4 | Environment adapter extraction | 运行环境差异不能永远埋在 session plugin 和 gateway 里 | web / discord / cron 都走统一 adapter contract |
| Later | M5 | Ready for trading-system harness | 上层 harness 需要稳定地基，而不是继续直接碰 plugin internals | 提供稳定的 state / action / trace / recovery surface 给上层消费 |

下面把每个里程碑展开。

---

## 9. M0：Run Contract 与迁移带

### 9.1 目标

先把“一轮 run 到底是什么”说清楚，并给现有 plugin 契约加一条迁移带。

### 9.2 为什么这是第一步

如果这一层不先立住，后面所有 phase 都会出现同一个问题：新对象已经在加，旧语义还在继续漏。

当前最明显的漏点有三个：

- `beforeChat` 里既有副作用，也有 state setup
- run completion 既有 model finish，也有 delivery finish，也有 persistence finish
- 旧 plugin 契约承载的责任太杂，不能直接一刀切换成单一 `contribute`

### 9.3 核心交付

- 正式的 run stage 定义
  建议最少拆成：
  `prepare -> resolveTools -> collectContext -> planContext -> executeModel -> deliver -> persist`

- 正式的 run-level 对象：
  `HarnessRunId`
  `RunPhase`
  `RunOutcome`
  `DeliveryOutcome`
  `PersistenceOutcome`

- `HarnessTrace v0`
  先不追求很细，但至少要能记录：
  - run id
  - agent type
  - channel / mode
  - stage transitions
  - final phase outcome
  - basic usage

- 迁移带
  不是直接废掉旧 hooks，而是先做桥接：
  - `beforeChat` 继续保留，语义重命名为 `prepare`
  - `systemPrompt / transformMessages` 先通过 adapter 进入新 context pipeline
  - `ctx.meta` 暂时保留，但收紧为过渡层，不再继续扩散

### 9.4 依赖

- 无上游依赖

### 9.5 完成标准

- 所有 run 都能生成统一的 trace skeleton
- web conversation 和 trigger 路径都能映射到统一 run stage
- 现有 presets 不需要在这一阶段大改
- “模型完成”“流完成”“持久化完成”三种完成语义在代码里被明确区分

---

## 10. M1：Structured Context + Thin Durable State

### 10.1 目标

把 context planning 做成正式层，同时补上一套最小 durable state，让 cache 和 compaction 有稳定落点。

### 10.2 为什么和 state 一起做

上一版 roadmap 把 `Context Management` 和 `State & Session` 切成前后两阶段，看起来整齐，但工程上不稳。

原因很简单：

- 没有 stable summary，就没有可靠 compaction
- 没有 continuation state，就没有可恢复 prompt plan
- 没有 checkpoint ref，就只有“再来一遍”，没有真正的 resume

所以这一阶段不是“先上 compaction，再说 state”，而是一起把最薄的一层 durable state 立住。

### 10.3 核心交付

- `ContextContribution`
  这里不让 plugin 提策略，但至少要带足够的描述性元数据，比如：
  - contribution type
  - source
  - mutability class
  - intended lifetime

- `PromptManifest`
  描述这一轮有哪些 context segments。

- `PromptPlan`
  描述 budget、cache、compaction 决策之后，最终怎样 materialize 成模型调用参数。

- `SummaryState`
  保存当前 run / session 可继续工作的摘要状态。

- `ContinuationState`
  保存“下一轮继续做什么”的最小工作状态。

- `CheckpointRef`
  指向最近一个安全恢复点。

- `ContextBudget`

- `CachePolicy`
  第一版只围绕稳定前缀设计，明确区分：
  - stable tools / system prefix
  - slowly changing context
  - recent history / live context

- `CompactionPolicy`
  第一版策略建议是：
  - Anthropic 路径优先 provider-native compaction / context editing
  - Flux 保留 fallback summary 路径
  - 不在没有 `SummaryState` 落点的 preset 上启用 aggressive compaction

### 10.4 依赖

- 依赖 M0 的 run contract 与 trace skeleton

### 10.5 完成标准

- runtime 不再把 prompt 当成一坨字符串到处传
- stable prefix 可以被识别、缓存并量化命中
- context compaction 有明确写入目标，而不是只做本轮裁剪
- session continuity 不再只依赖最近 `20` 条消息

---

## 11. M2：Tools & Permissions 成为正式控制面

### 11.1 目标

把 tools 从 registry-only 推进成 action / policy surface。

### 11.2 为什么不能继续后置

这一步如果继续往后拖，会出现两个坏结果：

- risky action 的控制逻辑继续散在 tool 实现内部
- approval 语义继续只存在于 UI 状态名，runtime 自己却不知道发生了什么

Flux 现在已经有这些信号：

- [trading-tools.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/trading-tools.ts) 里已经有 guard
- [tool-timeline.ts](/Users/glows777/codes/wcg/flux/packages/web/lib/ai/tool-timeline.ts) 已经有 approval 状态

这说明工具权限不是未来问题，而是当前已经存在、只是还没收束。

### 11.3 核心交付

- `ToolPlan`
  描述这轮有哪些工具可用，以及为什么可用。

- `ActionClass`
  建议第一版至少分成：
  - `read`
  - `research`
  - `display`
  - `write`
  - `trade`

- `ToolAvailabilityPolicy`

- `ActionPolicy`
  明确哪些动作：
  - 直接允许
  - 需要 guard
  - 需要 approval
  - 直接 deny

- `ApprovalState`
  把 UI 现有的 `approval-requested` / `approval-responded` 拉回 runtime 合同里。

- 工具风险分级
  参考主流 agent 平台的做法，把 read-only 与 write / financial-impact actions 明确分开。

### 11.4 依赖

- 依赖 M0 的 run contract
- 可以和 M1 并行设计，但正式 cutover 放在 M1 之后

### 11.5 完成标准

- tool availability 不再只是 plugin 合并结果
- risky write / trade action 可以在执行前被 pause / review / deny
- denial / approval / execution outcome 都能进 trace
- tool control 不再只靠 tool 内部自带 guard 硬扛

---

## 12. M3：Telemetry、Replay、Recovery

### 12.1 目标

把观测和恢复补成正式层，让 agent harness 不再是黑箱。

### 12.2 为什么这一步要晚于 M0-M2

没有清晰的 run stage、context objects、tool control surface，telemetry 只能记录一堆散点；看起来有日志，其实还是解释不了 run。

### 12.3 核心交付

- `HarnessTrace v1`
  至少拆成下面几层：
  - planning trace
  - model execution trace
  - tool execution trace
  - delivery trace
  - persistence trace

- cache 观测：
  - candidate size
  - read / write tokens
  - invalidation reason

- compaction 观测：
  - trigger reason
  - pre/post token count
  - compaction result
  - fallback vs native path

- failure taxonomy
  至少区分：
  - provider failure
  - tool failure
  - delivery failure
  - persistence failure
  - policy deny / approval timeout

- replay / resume contract

- recovery signal
  明确：
  - 从哪恢复
  - 要不要重放 tool
  - 哪些副作用绝不能重放

- 如果后面接 OpenTelemetry，这里对齐 `create_agent` / `execute_tool` 这类 span 语义，不另造一套完全孤立的 trace naming。

### 12.4 依赖

- 依赖 M0 的 run contract
- 依赖 M1 的 checkpoint 和 state 落点
- 依赖 M2 的 tool / approval outcome 语义

### 12.5 完成标准

- 任何一次 run 失败，都能回答“失败发生在哪个阶段”
- 任何一次 retry，都能回答“哪些副作用已经发生，哪些不能再跑”
- cache / compaction / tool policy 效果不再靠体感判断
- replay 和 recovery 有正式的输入与出口

---

## 13. M4：Environment Adapter Extraction

### 13.1 目标

把环境差异从 gateway / session plugin 这些隐含位置里抽出来，正式做成 adapter contract。

### 13.2 为什么不是最后一分钟才抽

这一步放在 roadmap 的后段，是因为它的切面很大；但对应的 contract 不能等到最后才想。M0 就要先占坑，M4 才做真正 extraction。

否则前面每一步都会默认：

- web conversation 是标准路径
- `sourceId` 是 session identity 的唯一解法
- history 注入方式可以在 plugin 里随便特判

到后面再抽 adapter，返工会很重。

### 13.3 核心交付

- `EnvironmentContext`
  把 channel、mode、source identity、delivery target 这些信息正式化。

- `EnvironmentAdapter`
  至少负责：
  - input normalization
  - session resolution strategy
  - history hydration strategy
  - delivery policy
  - error surface mapping

- 把 web / discord / cron 现有特判从 session plugin 和 gateway 里逐步迁出去

### 13.4 依赖

- 依赖 M0 的 run contract
- 会复用 M1-M3 已有对象，但本身不依赖它们全部落地后才开始设计

### 13.5 完成标准

- 环境差异不再主要靠 plugin 顺序和 `ctx.meta` 传递
- web / discord / cron 都能走同一套 adapter contract
- runtime 核心逻辑不再隐式偏向 web conversation

---

## 14. M5：Ready for Trading-System Harness

### 14.1 目标

这一步不是去实现 trading-system harness，而是把上层真正会依赖的 agent harness surfaces 稳定下来。

### 14.2 核心交付

- 稳定的 state surface
- 稳定的 action / permission surface
- 稳定的 trace / evidence surface
- 稳定的 recovery surface

### 14.3 完成标准

- 上层 `Control / Learning / Evolution` 不需要继续直接碰 plugin internals
- trading-system harness 可以把 agent harness 当成稳定底座，而不是半成品 runtime

---

## 15. 模块边界怎么落到代码目录

这份 roadmap 不是为了目录而目录，但目录还是要先稳定。

推荐的顶层关系仍然是：

```text
packages/server/src/core/ai/
  runtime/
  harness/
  plugins/
  presets/
```

其中：

- `runtime/` 继续是唯一编排中心
- `harness/` 放正式对象、策略、contract，不再另做第二个 orchestrator
- `plugins/` 负责能力注入与原材料生产，但不再拥有最终上下文决策
- `presets/` 继续负责 agent 组合和渐进迁移

`harness/` 建议按下面几个子域开骨架：

```text
harness/
  contracts/
  context/
  state/
  tools/
  telemetry/
  environment/
```

这里的重点不是立刻做完所有目录，而是：

- 先把名字定住
- 再按里程碑逐步把内容填进去

---

## 16. 迁移策略

这一段是上一版 roadmap 最缺的部分。

### 16.1 不做一次性断代

不建议在第一阶段就宣布：

- 旧 plugin 契约全部失效
- `systemPrompt / transformMessages` 立即废弃

更稳的做法是：

- 先定义新 contract
- 再给旧 hooks 做 compatibility adapter
- 最后按 preset 分批切换

### 16.2 迁移顺序

建议按下面顺序走：

1. 先给 runtime 加新 run stages 和 trace skeleton
2. 再把 legacy hooks 映射进新 context pipeline
3. 再把 `ContextContribution / PromptManifest / PromptPlan` 上线
4. 再把 `ToolPlan / ActionPolicy / ApprovalState` 上线
5. 最后才开始真正收缩 legacy hooks

### 16.3 rollout 策略

- 先在 `trading-agent` 上跑新 contract
- `auto-trading-agent` 稍后跟进，因为它依赖 heartbeat、session、tooling 的耦合更多
- 所有 cutover 都要有 regression 套件兜底，不接受“手测感觉没问题”

---

## 17. 验证轨道与 KPI

roadmap 如果没有验证轨道，很快就会重新变成观点文。

### 17.1 测试轨道

- runtime phase-order tests
- plugin compatibility tests
- context manifest / plan construction tests
- cache candidate and invalidation tests
- compaction path tests
- permission and approval path tests
- replay / resume tests
- regression coverage for both `trading-agent` and `auto-trading-agent`

### 17.2 运行指标

建议至少跟下面这些指标：

- `run_trace_coverage`
  有多少 run 生成了完整的 trace skeleton

- `cache_read_rate`
  stable prefix 的缓存读取比例

- `cache_invalidation_reason_distribution`
  cache 主要因为什么被打穿

- `compaction_trigger_rate`
  哪些路径在频繁触发 compaction

- `resume_success_rate`
  从 checkpoint 恢复的成功率

- `approval_pause_rate`
  哪些动作经常需要停下来等审批

- `policy_deny_rate`
  哪些动作经常被 runtime policy 拒绝

- `failure_explainability_rate`
  失败 run 中，有多少可以明确归类到某个 phase 和 failure class

---

## 18. 主要风险与缓解

### 18.1 旧 plugin 责任太杂

风险：
`sessionPlugin`、`heartbeatPlugin` 这些插件里，副作用、state setup、context production 混在一起。

缓解：
M0 先把 `prepare` 和 `collectContext` 分开，不直接强推“单一 contribute hook”。

### 18.2 provider 差异会把 context policy 搅乱

风险：
Anthropic 支持的 compaction / context editing / caching 语义，不一定能平移到所有 provider。

缓解：
`PromptPlan` 里保留 provider-specific adaptation，统一 contract 不等于统一实现细节。

### 18.3 过早追求 compaction，反而让连续性变差

风险：
如果没有 `SummaryState` 落点，compaction 可能只是把重要信息压丢。

缓解：
M1 里把 compaction 和 thin durable state 绑定交付。

### 18.4 tool policy 继续散在 tool 实现里

风险：
如果 M2 不真正切进去，runtime 还是看不见高风险动作。

缓解：
先把 tool risk 与 approval state 纳入 runtime 合同，再逐步从 tool 内部回收控制逻辑。

### 18.5 web-first 假设继续固化

风险：
如果 adapter contract 占坑太晚，后面所有 state / trace / recovery 对象都会默认 web conversation。

缓解：
M0 先定义 `EnvironmentContext`，M4 再做完整 extraction。

---

## 19. 暂时不做什么

这条 roadmap 当前明确不处理下面这些内容：

- trading-system harness 的具体实现
- 决策工作流设计
- strategy / lessons / control 的长期演化
- runtime 外再造一个新的 orchestrator
- 为了兼容旧结构而放弃新 contract
- 只有概念、没有退出标准的“先把模块搭起来”

---

## 20. 一句话总结

如果把这份文档压成一句话，我保留这一句：

**Flux 的 Agent Harness，不是在 runtime 外再套一层壳，而是把现有 runtime 逐步长成一个真正可运行、可暂停、可恢复、可观测、可约束的 agent shell；这条路不是先堆模块，而是先立 run contract，再补 context、state、permissions、telemetry 和 adapter，最后把它变成上层 Trading-System Harness 可以稳定依赖的底座。**

---

## 参考资料

- [OpenAI: A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- [OpenAI: Agents SDK](https://developers.openai.com/api/docs/guides/agents)
- [Anthropic: Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Anthropic: Compaction](https://platform.claude.com/docs/en/build-with-claude/compaction)
- [Anthropic: Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)
- [Anthropic: Claude Code SDK overview](https://docs.anthropic.com/en/docs/claude-code/sdk)
- [LangGraph: Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph: Durable execution](https://docs.langchain.com/oss/javascript/langgraph/durable-execution)
- [LangGraph: Interrupts / human-in-the-loop](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [OpenTelemetry: Semantic conventions for generative AI systems](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OpenTelemetry: GenAI spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [Atlassian: Technology roadmap](https://www.atlassian.com/agile/project-management/technology-roadmap)
