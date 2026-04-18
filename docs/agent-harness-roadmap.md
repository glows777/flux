# Flux Agent Harness Roadmap

> 定位：这是一份针对 Flux 的 agent roadmap。当前版本不把重点放在完整 harness 设计上，而是先处理近端的 runtime hardening。
>
> 当前范围：自动压缩、Prompt Cache、每轮上下文可观测。
>
> 最后更新：2026-04-18

---

## 1. 这份文档为什么收窄

上一版文档把 agent harness 讲得很完整，但对 Flux 当前阶段来说有点超前。

现阶段真正明确的需求只有三件事：

- 自动压缩
- Prompt Cache
- 每轮上下文可观测

如果现在为了这三件事就去重做一套完整 harness，把 state、permissions、recovery、environment adapter、hook contract 一次性展开，成本会明显高于收益。

所以这份文档现在换一个写法：

- 近端只做 `runtime hardening`
- 远端保留 `harness vision`

也就是说，这份 roadmap 现在不是“设计一个更完整的大系统”，而是“把现有 runtime 做得更省、更稳、更可见”。

---

## 2. 当前系统快照

Flux 现在已经有一个能跑的 agent runtime，主链路主要在这些文件里：

- [create.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/runtime/create.ts)
- [execute.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/runtime/execute.ts)
- [router.ts](/Users/glows777/codes/wcg/flux/packages/server/src/gateway/router.ts)
- [gateway.ts](/Users/glows777/codes/wcg/flux/packages/server/src/gateway/gateway.ts)

按现在的代码，一轮 run 大致是：

1. `beforeChat`
2. 收集 `systemPrompt` 和 `tools`
3. `transformMessages`
4. `transformParams`
5. `streamText`
6. `consumeStream` 或 route `onFinish`
7. `finalize`
8. `afterChat` / `onError`

这套 runtime 其实已经不弱。现在的问题不是它跑不起来，而是下面三件事还不够正式：

- 上下文到底由哪些段组成，外部看不清
- 稳定前缀能不能缓存，还没有明确策略
- 长上下文怎么压，什么时候压，压完效果怎样，还没有清楚的观测面

换句话说，当前瓶颈不在“没有 harness”，而在“runtime 还不够硬”。

---

## 3. 当前目标

这份 roadmap 当前只回答一个问题：

**怎样在不重设计 runtime 的前提下，把现有 runtime 做得更便宜、更稳定、更可见。**

当前明确要做的，只有三块。

### 3.1 Context Visibility

要能看见：

- 这一轮 system、messages、tools 分别是什么
- 哪些段是稳定前缀
- 哪些段是 recent history
- 哪些段参与了压缩
- 每段大概占了多少 token

### 3.2 Prompt Cache

要能回答：

- 哪些前缀值得缓存
- 它们在不同 provider 上怎样命中
- 命不中主要是因为什么

### 3.3 Auto Compaction

要能回答：

- 什么时候触发压缩
- 走 provider-native 还是 fallback
- 压缩前后差了多少
- 有没有把关键上下文压丢

---

## 4. 现在不做什么

这份文档当前明确不把下面这些东西当成近端目标：

- 完整 permissions model
- approval / deny workflow
- checkpoint / replay / recovery
- environment adapter 抽象
- 大规模重写 plugin hook
- 完整 state model
- 上层 trading-system control surface

这些东西不是永远不做，而是现在没有足够需求支撑它们进入当前工程优先级。

---

## 5. 近端 Roadmap

### R0：Context Visibility

#### 目标

先把“这一轮到底喂了什么”看清楚。

#### 核心交付

- `ContextManifest`
  不是新系统，只是给当前 runtime 增加一份结构化视图
- context segments 分类
  第一版只需要够用，比如：
  - system
  - memory / long-lived context
  - recent history
  - live context
  - tools
- 每轮 token breakdown
- debug / trace 输出
  至少能在开发态或日志里看到这一轮实际拼出来的内容

#### 完成标准

- 能回答“这一轮到底喂了什么”
- 能回答“哪一段最占上下文”
- 后面的 cache 和 compaction 不再建立在猜测上

### R1：Prompt Cache

#### 目标

围绕稳定前缀做缓存，不去碰所有动态段。

#### 核心交付

- stable prefix 识别
- provider-aware cache policy
- cache hit / miss 基础指标
- cache invalidation reason

#### 完成标准

- 重复前缀开始稳定命中
- 命中效果可以量化，不靠体感
- recent history 和 live context 不为了凑 cache 而被硬塞进稳定前缀

### R2：Auto Compaction

#### 目标

在不重写 runtime 的前提下，把长上下文压缩做好。

#### 核心交付

- provider-aware compaction
  有原生能力的 provider 先走原生能力
- fallback compaction path
  只做最小必需，不引入完整 checkpoint 系统
- compaction 触发信号
- compaction 前后 token 对比

#### 完成标准

- 长对话和长工具链不会无上限膨胀
- 压缩触发条件和结果可以观测
- compaction 只是 runtime hardening，不顺手扩成完整 state/recovery 方案

### R3：Observability Polish

#### 目标

把前面三块收成一套好用的运行可见性，而不是零散调试输出。

#### 核心交付

- 每轮 run trace
- cache / compaction 可观测字段统一
- 关键指标沉淀
- regression coverage

#### 完成标准

- 任何一轮都能回答“喂了什么、命中了什么、压了什么”
- 调优 runtime 时，不再主要靠试错

---

## 6. 实现原则

这部分是为了防止 roadmap 又慢慢膨胀回去。

### 6.1 不做 big-bang rewrite

现有 `systemPrompt / transformMessages / transformParams / ctx.meta` 先保留。只在当前需求真的卡住时，才局部抽象。

### 6.2 不为抽象而抽象

如果某个新对象解决不了下面三个问题之一，就先不要引入：

- 让上下文更可见
- 让 cache 更稳定
- 让 compaction 更可靠

### 6.3 先观测，再优化

没有 `ContextManifest` 和 token breakdown，cache 和 compaction 都很容易越做越盲。

### 6.4 provider 差异留在实现层

contract 可以统一，具体策略不强行统一。Anthropic、OpenAI、后续 provider 的 cache / compaction 能力不一样，这很正常。

---

## 7. 什么时候再重新打开 Harness 话题

只有在下面这些需求真的出现以后，才值得把 runtime hardening 升级成完整 harness 设计：

- 同一套系统长期跑 `web / discord / cron`
- 某些 action 开始需要正式的 approval / deny / escalation
- 失败后必须 resume，而不是简单 retry
- 上层 trading-system 开始依赖稳定的 `state / action / trace`
- 现在的 hooks 已经明显扛不住新需求

在这之前，`harness` 更适合当成长期地图，不适合当成当前工程主题。

---

## 8. 远期 Vision，先放 Parking Lot

如果以后这些需求真的出现，后面的主题大概率还是这些：

- 更正式的 state
- 更正式的 action / permission surface
- 更正式的 replay / recovery
- 更明确的 environment adapters

但这些现在先不展开，不再占当前 roadmap 的主体。

---

## 9. 一句话总结

Flux 现在更需要的不是一个更大的 harness，而是一个更硬的 runtime。先把上下文看清楚，把缓存做好，把压缩做好，后面真有长期运行和系统控制的需求，再把 harness 单独拉出来。

---

## 参考资料

- [Anthropic: Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Anthropic: Compaction](https://platform.claude.com/docs/en/build-with-claude/compaction)
- [Anthropic: Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)
- [OpenAI: A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- [Atlassian: Technology roadmap](https://www.atlassian.com/agile/project-management/technology-roadmap)
