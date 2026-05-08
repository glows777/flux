# Flux Agent Runtime Foundation Roadmap

> 定位：这是一份 Flux 的 agent 基础建设 roadmap。
>
> 它不是单个功能 spec，也不是马上启动完整 harness 的计划；它定义的是 Flux 要长期支持 Copilot、Auto Trading、后台研究、sub-agent、长期任务时，底层必须先稳定下来的运行能力。
>
> 最后更新：2026-05-08

---

## 1. 为什么需要这份 roadmap

Flux 现在已经有能跑的 agent runtime：web chat、Discord、cron、trading-agent、auto-trading-agent、context manifest、cron run log 都已经存在。

但这些能力目前还是分散的：

- chat 有 `ChatSession` / `ChatMessage`
- 每轮上下文有 `ChatMessageManifest`
- cron 有 `CronJobRun`
- auto trading 有 broker guard、heartbeat、memory slot
- 未来 background research / sub-agent 还没有统一归宿

如果继续直接往上加产品能力，短期会很快，长期会出现几个问题：

- 每种入口各记各的账，无法回答“一次 agent 运行到底发生了什么”
- cron、chat、background、sub-agent 之间缺少统一状态模型
- Copilot 和 Auto Trading 的权限边界容易停留在 prompt 约定里
- memory 能被哪些 agent 读写，缺少正式 scope
- 后台任务和子任务树没有稳定的 parent / child run 关系
- 未来要做审计、恢复、取消、复盘、成本分析时，需要从多个表和日志里拼事实

所以这份 roadmap 的核心判断是：

**Flux 现在不该直接启动完整 trading harness；应该先补 agent runtime foundation。**

---

## 2. 为了什么

这份 roadmap 要服务四个目标。

### 2.1 统一运行底账

每一次 agent 运行，无论来自 web chat、Discord、cron、background task，还是未来 sub-agent，都应该有一条统一的执行记录。

代码模型可以叫 `AgentRun`，文档语义上叫 **Run Ledger**。

它不是普通 log，而是结构化的运行账本：能查询、能关联、能审计、能支撑产品功能。

### 2.2 稳定 agent 边界

Flux 未来不应该只靠两个硬编码 agent 类型继续扩展。Copilot、Auto Trading、Research、后台任务、子任务执行器，会有不同的能力边界。

系统需要能回答：

- 这个 agent 能不能下单
- 能不能写 memory
- 能写哪个 memory scope
- 能不能后台运行
- 能不能 spawn child run
- 默认 channel / mode / model / tool set 是什么

### 2.3 保护长期状态

AI 可以自然决定“该记住什么”，但系统必须保证“谁能读写什么”是清楚的。

尤其是 Copilot 和 Auto Trading：

- Copilot 可以有用户偏好、研究偏好、对话历史
- Auto Trading 可以有策略、交易教训、风险状态
- 两者不能靠 prompt 约定来避免串状态

### 2.4 支撑长期任务和 sub-agent

后台研究、定时运行、多轮任务、sub-agent 不是 chat message 的变体。它们需要：

- run 状态
- parent / child 关系
- 输入输出 artifact
- 取消和失败记录
- 成本、token、工具调用追踪
- 最终结果与来源对象的关联

这些能力应该建在统一运行底账上，而不是每个功能各自补一套。

---

## 3. 当前不做什么

为了避免基础建设膨胀，这份 roadmap 当前明确不做：

- 完整 trading harness
- 自动策略进化系统
- control / learning / evolution 的完整产品化
- 完整 replay / checkpoint / recovery
- 复杂权限审批流
- 新 UI 工作台
- 为 AI SDK 重造 agent loop

AI SDK 已经提供 agent/tool loop、streaming、tool calling、approval 等执行原语。Flux 要补的是应用层的运行记录、状态、边界和长期任务基础设施。

---

## 4. 设计原则

### 4.1 先底账，后编排

没有统一 run record，就不要急着做 sub-agent orchestration。否则后面所有可观测、取消、复盘、成本分析都会变成补丁。

### 4.2 先边界，后自治

Auto Trading 这类 agent 可以越来越自主，但系统边界必须先存在。哪些 action 允许、哪些 memory 可写、哪些任务可后台跑，都应该是 runtime policy，而不是只写在 prompt 里。

### 4.3 保留现有 runtime

当前 `createAIRuntime`、plugin hook、`ContextManifest`、session plugin 都有价值。短期不做 big-bang rewrite，而是在现有 runtime 外补运行底账和关联关系。

### 4.4 Memory 不替 AI 做决定

系统不硬编码“AI 应该学到什么”，但系统要管理 memory 的 scope、版本、来源、作者和回滚能力。

### 4.5 Roadmap 可分阶段回滚

每一阶段都要能独立带来价值。即使后续 sub-agent 暂时不做，Run Ledger 和 Agent Policy 也应该能改善当前 chat / cron / auto trading。

---

## 5. Roadmap

### R0：Run Ledger Foundation

目标：所有 agent run 都有统一执行底账。

核心交付：

- 新增 `AgentRun` 数据模型
- run status：`queued` / `running` / `succeeded` / `failed` / `cancelled`
- run source：`web` / `discord` / `cron` / `background` / `sub_agent`
- 关联 `sessionId`、`messageId`、`cronJobId`、`parentRunId`
- 记录 `agentType`、mode、userId、sourceId、startedAt、finishedAt、durationMs
- 记录输入摘要、输出摘要、error、usage
- web chat 和 cron 都开始写入 `AgentRun`

完成标准：

- 能从一个 `runId` 查到这次 agent 运行的入口、状态、结果和关联对象
- `CronJobRun` 不再是唯一 cron 执行事实来源，而是 cron 视角的辅助记录
- `ChatMessageManifest.runId` 能和 `AgentRun.id` 对齐

### R1：Trace Unification

目标：把上下文、工具、token、错误都挂到统一 run 上。

核心交付：

- 将现有 `ContextManifest` 关联到 `AgentRun`
- 结构化记录 tool calls / tool results
- 记录 cache / compaction 结果
- 记录 provider、model、token usage、finish reason
- 标准化 error shape

完成标准：

- 任意一轮 run 都能回答“喂了什么、用了什么工具、花了多少 token、为什么失败”
- 调试不再依赖散乱 console log

### R2：Agent Registry and Policy

目标：从硬编码 agent type 走向可注册 agent。

核心交付：

- 定义 agent registry
- agent metadata：name、description、default model、default tools、default mode
- agent policy：canTrade、canWriteMemory、canRunInBackground、canSpawnChildRuns
- tool set 与 agent policy 对齐
- Copilot / Auto Trading / Research 的边界在 registry 中表达

完成标准：

- 新增 agent 不需要在多处硬编码分支
- Auto Trading 的交易权限不只存在于 prompt
- Copilot 和 Auto Trading 的 tool / memory / background 能力边界可查询

### R3：Memory Scope Foundation

目标：长期状态按 owner 和用途隔离。

核心交付：

- 为 memory 增加 scope / namespace 设计
- 区分 user memory、agent memory、strategy memory、research memory
- memory write 记录来源 `runId`
- memory version 支持按 scope 查询和回滚
- agent policy 控制可读写 scope

完成标准：

- Copilot 不会误读或误写 Auto Trading strategy
- Auto Trading 的策略、教训、风险状态有明确归属
- 每次 memory 变化都能追溯到具体 run

### R4：Background Task and Artifact Layer

目标：让后台研究和长期任务有正式产物。

核心交付：

- background run 创建和状态查询
- artifact 模型：report、chart、data snapshot、research note
- artifact 关联 `runId` / `parentRunId`
- 支持任务取消和失败保留
- 支持把 background run 结果回贴到 chat / Discord

完成标准：

- 后台研究不再伪装成一条普通 chat message
- 用户能追踪任务状态和最终产物
- 失败任务有可读错误和可复盘上下文

### R5：Sub-agent Orchestration

目标：在有运行底账之后，再做子任务树。

核心交付：

- parent / child run tree
- sub-agent spawn policy
- child run 输入输出约束
- 汇总器 run 负责整合结果
- 防止无限 spawn / 超预算

完成标准：

- 一个复杂研究任务可以拆成多个 child runs
- 每个 child run 都有自己的 trace、tools、usage、error
- 父 run 能稳定汇总、失败降级和输出最终结果

---

## 6. Todo

### R0：Run Ledger Foundation

- [ ] 设计 `AgentRun` Prisma model
- [ ] 明确 `AgentRun.status`、`source`、`mode`、`agentType` 字段枚举
- [ ] 设计 `AgentRun` 与 `ChatSession` / `ChatMessageManifest` / `CronJob` / `CronJobRun` 的关系
- [ ] 在 runtime chat start 时创建 `AgentRun`
- [ ] 在 stream consume / finalize 后更新 run success
- [ ] 在 runtime error path 更新 run failure
- [ ] 在 cron executor 中传递 `cronJobId` 并关联 run
- [ ] 让 `ChatMessageManifest.runId` 使用同一个 `AgentRun.id`
- [ ] 增加 unit tests：web chat success / error
- [ ] 增加 unit tests：cron success / error

### R1：Trace Unification

- [ ] 定义 tool event 存储形态
- [ ] 将 `ContextManifest` 挂到 `AgentRun`
- [ ] 标准化 provider / model / usage / finish reason 字段
- [ ] 标准化 error payload
- [ ] 增加 run trace 查询 helper
- [ ] 增加 cache / compaction 字段对齐检查

### R2：Agent Registry and Policy

- [ ] 设计 agent registry 类型
- [ ] 把 `trading-agent` 注册为 Copilot 类 agent
- [ ] 把 `auto-trading-agent` 注册为 Auto Trading 类 agent
- [ ] 定义 agent policy 字段
- [ ] 将 tool availability 从 preset 迁移到 registry/policy 可解释结构
- [ ] 增加 policy tests：Copilot 不可直接执行 auto-only action
- [ ] 增加 policy tests：Auto Trading 可使用交易工具但受 broker guard 限制

### R3：Memory Scope Foundation

- [ ] 设计 memory scope / namespace 字段
- [ ] 设计旧 `MemoryVersion` 数据迁移策略
- [ ] 给 memory writes 关联 `runId`
- [ ] 在 memory loader 中按 agent policy 过滤 scope
- [ ] 增加 memory rollback 查询路径
- [ ] 增加 tests：Copilot / Auto Trading memory 隔离

### R4：Background Task and Artifact Layer

- [ ] 设计 background run 创建 API
- [ ] 设计 artifact 数据模型
- [ ] 支持 report / research note artifact
- [ ] 支持 background run 状态查询
- [ ] 支持取消 queued / running run
- [ ] 支持任务完成后回贴到 channel
- [ ] 增加 tests：background success / failure / cancel

### R5：Sub-agent Orchestration

- [ ] 设计 parent / child run tree 查询
- [ ] 设计 sub-agent spawn policy
- [ ] 设置 max depth / max child count / max token budget
- [ ] 设计汇总器 run 合并 child outputs
- [ ] 增加 tests：child run failure 不导致整棵任务树不可解释

---

## 7. 启动建议

第一阶段只启动 R0。

R0 的目标不是让 Flux 立刻更聪明，而是让 Flux 的每一次 agent 运行都能被系统稳定看见。只要这一步完成，后面的 trace、policy、memory scope、background task、sub-agent 都会有可以挂载的底座。

---

## 8. 一句话总结

这份 roadmap 要解决的不是“再做一个 agent”，而是先把 Flux 的 agent 运行变成可记录、可追踪、可隔离、可扩展的基础设施。
