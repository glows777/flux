# Flux Agent Harness Roadmap

> 定位：这是一份针对 Flux 的 agent harness roadmap。它只讨论 agent loop 这一层如何被组织、约束、延续、观测和恢复，不讨论交易决策工作流，也不讨论交易系统的长期学习与策略进化。
>
> 最后更新：2026-04-18

---

## 1. 先把两层分开

Flux 现在其实有两条不同的 harness 主线。

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

所以顺序要明确：

**先把 Agent Harness 做完整，再让 Trading-System Harness 长在它上面。**

---

## 2. 这份 roadmap 的核心判断

这里最重要的判断只有一句：

**Agent Harness 不是 runtime 外再套一层壳，而是现有 runtime 的下一阶段形态。**

这句话会直接决定后面的所有模块拆分。

如果把 harness 理解成 runtime 外的一层，就会出现两个编排中心：

- 一个是现在已经存在的 runtime
- 一个是新加出来的 harness planner

这会马上把系统切裂。

Flux 现在已经有一个明确的执行主干：

- [create.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/runtime/create.ts) 负责 runtime factory 和主链路
- [execute.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/runtime/execute.ts) 负责 hook 执行与收集
- plugins 负责原材料和局部能力
- presets 负责 agent 组合

所以接下来真正要做的，不是再发明第二个 orchestrator，而是让现在这套 runtime 自己长出 harness 能力。

换句话说，后面的改造都要围着同一个中心展开：

**runtime 继续是唯一编排中心，但它要从“收集和转发”演化成“收集、理解、规划并执行”。**

---

## 3. 当前系统缺的不是 runtime，而是 runtime 太薄

Flux 底下已经有一个能跑的 agent runtime。

已有的部分很明确：

- runtime lifecycle 已经有了
- session、history、memory、prompt、tools、多 provider 都已经存在
- `trading-agent` 和 `auto-trading-agent` 两条 preset 也已经跑起来了

问题不是没有系统，而是现在这套 runtime 还太薄，很多本来应该属于 harness 的能力，仍然散在 plugin 和隐式约定里。

最明显的几个缺口是：

- `Context Management`
  现在主要还是最近 `20` 条消息截断，每轮重新组 prompt，没有正式的 budget、compaction、cache 策略。

- `State & Session`
  现在有 session 和记忆，但还没有 summary state、continuation state、checkpoint 所依赖的正式对象。

- `Tools & Permissions`
  现在有 tool registry 和 guard，但还没有正式的 action / permission surface。

- `Telemetry & Recovery`
  现在能拿到 basic usage，但没有 segment 级观测、cache hit/miss、compaction 事件、failure path 和恢复信号。

所以当前 Flux 更准确的说法不是“缺一个新的 harness layer”，而是：

**runtime 已经存在，但它还没有长成完整的 Agent Harness。**

---

## 4. 目标形态：runtime 自己长出六个能力面

Agent Harness 的终态，不是一个新目录包住 runtime，而是 runtime 自己逐步拥有六个正式能力面。

### 4.1 Environment Adapters

这一面吸收运行环境差异。

在 Flux 里，它不是 shell/workspace，而是：

- `web`
- `discord`
- `cron`
- `conversation`
- `trigger`

它的职责不是决定业务策略，而是把不同入口统一变成 agent loop 可消费的输入。

### 4.2 Execution Kernel

这一面就是 runtime 自己。

它负责：

- 生命周期
- step policy
- 参数变换
- 模型调用
- finalize / afterChat / onError

后面其它能力面都要往这条主链里长，而不是包在它外面。

### 4.3 Tools & Permissions

这一面不只是“有哪些工具”，而是：

- 这轮有哪些工具可用
- 哪些动作在当前模式下被允许
- 哪些调用需要额外约束
- 工具结果怎样被拦截和解释

### 4.4 State & Session

这一面负责连续性。

它不只包括 session 和 message history，还包括：

- session identity
- recent history
- summary state
- continuation state
- checkpoint / recovery 所依赖的最小状态

### 4.5 Context Management

这一面负责一轮请求到底喂给模型什么。

它应该正式拥有：

- prompt assembly
- context budget
- pruning
- auto-compact
- prompt cache
- provider-native cache / compaction orchestration

### 4.6 Telemetry & Recovery

这一面负责让 agent harness 不再是黑箱。

它至少要能看见：

- input/output tokens
- segment 占比
- cache hit/miss
- compaction 触发与结果
- latency
- failure path
- recovery signal

这六面不是 runtime 外的一圈模块，而是 runtime 自己要逐步拥有的正式能力面。

---

## 5. 模块怎么拆

模块边界按混合式来切：

- `runtime/` 负责生命周期和编排
- `harness/` 负责正式对象和策略
- `plugins/` 负责结构化原材料生产
- `presets/` 继续负责 agent 组合

这不是把 runtime 拆碎，而是给 runtime 一个更清楚的内部结构。

### 5.1 顶层分工

推荐的顶层关系是：

```text
packages/server/src/core/ai/
  runtime/
  harness/
  plugins/
  presets/
```

其中：

- `runtime/` 继续是唯一编排中心
- `harness/` 不编排，只定义对象和策略
- `plugins/` 不再拥有最终上下文决策，只交结构化原材料

### 5.2 harness 目录骨架

`harness/` 先立完整骨架，但只实现 Phase A 需要的部分。

```text
harness/
  contracts/
  context/
  telemetry/
  state/
  permissions/
  environment/
```

这里的意思不是一上来把六个目录都做完，而是：

- `contracts + context + telemetry` 在 Phase A 里真正实现
- `state + permissions + environment` 先只立骨架，给后续 Phase 留稳定目录

这一步的重点是让目录先稳定，后面不要搬家。

---

## 6. plugin 契约在这一步就定下来

这一步不再兼容旧的 plugin 契约。

原因很简单：既然已经决定 runtime 要往 harness 演化，就不应该继续让旧的 `systemPrompt / transformMessages` 路径把新结构拖回去。

新的方向要明确：

- plugins 暴露一个单一的 `contribute` hook，用来提供上下文原材料
- `tools` 保持独立通道，不并进 contribution 协议
- runtime 负责统一收 contributions，再规划上下文

第一批角色映射直接写死：

- `sessionPlugin` → `history contribution`
- `promptPlugin` → `base system + memory contribution`
- `heartbeatPlugin` → `live context contribution`

从这一步开始，plugin 的边界就变清楚了：

- plugin 负责交原材料
- runtime 负责决定这些原材料怎样进入模型

---

## 7. Phase A 的中心不是模块，而是正式对象

Phase A 要先立住 `Runtime-native Context Management + Minimal Telemetry`。

这一步最重要的不是“再加一个模块”，而是让 runtime 原生拥有一组正式对象。

### 7.1 ContextContribution

它回答：

**plugin 往 runtime 交什么原材料。**

这一版里，`ContextContribution` 是纯原材料对象，不带策略 hint。  
也就是说，plugin 不负责告诉 runtime：

- 这段优先级多高
- 这段适不适合缓存
- 这段该不该先压缩

这些都由 harness 策略决定，不交给 plugin。

同时，还有一个边界要明确：

- `tools` 不属于 contribution
- `tools` 走独立 runtime 通道

### 7.2 PromptManifest

它回答：

**这一轮到底有哪些上下文段。**

`PromptManifest` 是 runtime 收齐 contributions 之后形成的完整上下文全貌。

它不是最终调用参数，也不该直接等于 prompt string。  
它只描述：

- 有哪些 segment
- 每个 segment 来自哪类原材料
- 这一轮完整上下文全貌是什么

这里也要锁一个边界：

- `tools` 不属于 `PromptManifest`

### 7.3 ContextBudget

它回答：

**各段最多占多少，上下文满了先压谁。**

第一版不用追求特别智能，先把正式预算模型立住就够了。

### 7.4 CompactionPolicy

它回答：

**什么时候触发压缩，压什么，native 和 fallback 怎么选。**

Anthropic 上优先 native compaction，Flux 自己保留 fallback path。

### 7.5 CachePolicy

它回答：

**哪些前缀值得缓存，怎么形成稳定前缀，命不中怎么办。**

第一版只围绕稳定前缀设计，不碰 recent messages 和 live context。

### 7.6 PromptPlan

它回答：

**runtime 最终准备怎样把 manifest 送给模型。**

这里要故意把 `PromptManifest` 和 `PromptPlan` 分开：

- `PromptManifest` 是完整上下文图
- `PromptPlan` 是做完 budget、compact、cache 决策后的模型调用前方案

`PromptPlan` 仍然保持结构化，最后一步才 materialize 成：

- `system`
- `messages`
- `tools`
- `providerOptions`

### 7.7 HarnessTrace

它回答：

**这一轮规划和执行到底发生了什么。**

它应该记录：

- planning decision
- compaction decision
- cache decision
- usage
- latency
- 以及后面 recovery 会用到的最小运行信息

---

## 8. runtime 的演化路径要写成正式阶段

这份 roadmap 里，runtime 的演化路径直接定成下面这七步：

1. `beforeChat`
2. `collectTools`
3. `collectContributions`
4. `transformParams`
5. `planContext`
6. `executeModel`
7. `finalize`

这里最重要的新阶段是：

**`planContext`**

它不是外部 planner，而是 runtime 自己新增的正式阶段。

runtime 到这里就不再只是“收集和转发”，而开始：

- 收集 contributions
- 组装 `PromptManifest`
- 应用 `ContextBudget`
- 应用 `CompactionPolicy`
- 应用 `CachePolicy`
- 生成最终 `PromptPlan`

然后 runtime 再进入模型调用。

这就是 runtime-native harness 的核心。

---

## 9. Roadmap

这条 roadmap 不是一次做完整个 agent harness，而是按依赖顺序推进。

### Phase A：Runtime-native Context Management + Minimal Telemetry

#### 目标

先把一轮请求怎么被组装、裁剪、压缩、缓存，以及这些行为有没有生效这件事立住。

#### 核心交付

- `ContextContribution`
- `PromptManifest`
- `ContextBudget`
- `CompactionPolicy`
- `CachePolicy`
- `PromptPlan`
- `HarnessTrace`
- runtime 内部的 `planContext` 阶段

#### 完成标准

- Flux 不再把 prompt 当成一坨字符串
- runtime 不再只会收集和转发，而开始原生拥有 context planning
- prompt caching 开始围绕稳定前缀设计
- compact / cache 的效果开始能被量化

### Phase B：State & Session

#### 目标

把 agent 的连续性从“历史消息列表”推进到“正式工作状态”。

#### 核心交付

- summary state
- continuation state
- checkpoint 所需的最小对象
- 更清楚的 session 生命周期

#### 完成标准

- agent 不再只依赖最近消息和 memory slot 维持连续性
- compaction 开始有稳定落点

### Phase C：Telemetry & Recovery

#### 目标

把 agent harness 的观测和恢复补成正式层。

#### 核心交付

- segment 级 telemetry
- failure path trace
- recovery signal
- replay 所需的最小运行记录

#### 完成标准

- cache / compact / provider 行为不再是黑箱
- agent 出错后的恢复路径开始可见

### Phase D：Tools & Permissions

#### 目标

把工具从 registry-only 继续推进成 action / policy surface。

#### 核心交付

- tool availability 规则
- mode-level action gating
- 更清楚的 tool permission model

#### 完成标准

- agent 不再只是“有一堆工具可调”
- 哪些动作在当前模式下可用开始制度化

### Phase E：Environment Adapters + Execution Kernel consolidation

#### 目标

把运行环境差异和内核策略正式收束出来。

#### 核心交付

- 更清楚的 environment adapter
- execution policy
- retry / timeout / provider fallback 规则

#### 完成标准

- agent harness 不再只是 plugin 组合
- Flux 开始拥有更清楚的 runtime-native agent shell 边界

---

## 10. Validation tracks

这份 roadmap 真正落地时，至少要有下面这些验证轨道：

- runtime phase-order tests
- plugin contract tests for `contribute`
- manifest and plan construction tests
- budget and compaction path tests
- cache candidate and cache decision tests
- trace emission tests
- regression coverage for both `trading-agent` and `auto-trading-agent`

这里先把轨道写清楚，不把它展开成实现 checklist。

---

## 11. 暂时不做什么

这份 roadmap 当前明确不处理下面这些内容：

- trading-system harness
- 决策工作流
- strategy / lessons / control 的长期演化
- UI / 产品结构
- runtime 外的新 orchestrator
- 为了兼容旧 plugin 契约而牺牲新结构

这些都重要，但它们不属于当前这条 Agent Harness 主线的第一优先级。

---

## 12. 一句话总结

如果把这份文档压成一句话，我保留这一句：

**Flux 的 Agent Harness，不是在 runtime 外再套一层壳，而是让 runtime 自己长成完整的 agent loop 运行外壳，让一轮请求怎么被组装、怎样延续、怎样被约束、怎样被观测这几件事先变成正式系统，后面的 Trading-System Harness 才有稳定地基。**
