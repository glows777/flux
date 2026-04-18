# Flux Harness Roadmap

> 定位：这是一份针对 Flux 的 trading-system harness 文档。当前版本更接近远期方向图，不是当前开发排期。
>
> 当前结论：这条 roadmap 先保留，但暂时不启动。
>
> 最后更新：2026-04-18

---

## 1. 这份文档现在的角色

上一版把 `Control / Learning / Evolution` 讲得很完整，但对 Flux 当前阶段来说，它更像中远期方向，不是近端工程主题。

原因很简单：

- 现阶段最明确的需求还在 runtime 层
- 当前最需要补的是自动压缩、Prompt Cache、可观测性
- 上层 trading harness 还没有足够多的真实运行数据和稳定依赖面

所以这份文档现在的角色要改一下：

- 它保留方向
- 它不主导当前开发
- 它只定义以后什么时候值得重新启动这条线

---

## 2. 当前已经有的资产

虽然这条 roadmap 先不启动，但 Flux 不是从零开始，底下已经有不少跟 trading harness 有关的零件。

比较关键的资产在这些位置：

- [prompt.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/trading-agent/prompt.ts)
  已经把交易 loop、无操作原则、`agent_strategy` 的使用方式写进 prompt
- [guard.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/broker/guard.ts)
  已经有单笔金额、冷却期、单日亏损这些硬边界
- [types.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/trading-agent/types.ts)
  已经有 heartbeat context、baseline、strategy path 这些对象
- [memory/types.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/memory/types.ts)
  已经有 `lessons`、`portfolio_thesis`、`agent_strategy` 这些长期对象
- [memory/loader.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/memory/loader.ts)
  `trading-agent` 已经会把长期 slot 预加载进上下文
- [heartbeat/index.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/plugins/heartbeat/index.ts)
  auto-trading 路径已经会同步订单、构建 heartbeat context、seed `agent_strategy`

这些资产没有白做，它们后面大概率都会进入更正式的 trading harness。只是现在还没到需要把它们系统化的时候。

---

## 3. 为什么这条线现在不该启动

### 3.1 近端需求不在这里

你现在真正要解决的是：

- 自动压缩
- Prompt Cache
- 每轮上下文可观测

这三件事都还是 runtime hardening，不是 trading-system harness。

### 3.2 下层依赖还没稳定

如果底下的 agent runtime 还没有稳定的：

- run contract
- context visibility
- action surface
- trace

上层就很难真正长出正式的 `Control / Learning / Evolution`，最后多半还是回到 prompt 规则和 memory 约定。

### 3.3 真实样本还不够

trading harness 真正难的地方，不是把概念命名成 `Control / Learning / Evolution`，而是判断：

- 什么结果值得学
- 什么只是噪声
- 什么证据足够影响 strategy

这些判断都很吃真实运行样本。如果当前运行密度和复盘深度还不够，上太早只会把概念做在前面。

---

## 4. 这份文档保留什么

虽然这条线先不启动，但方向本身还是有价值的，后面大概率还是这三层。

### 4.1 Control

先定义当前允许怎么行动。

以后如果正式启动，这一层大概会关心：

- mode
- permissions
- entry conditions
- risk budget
- contain / observe / no-op

### 4.2 Learning

再定义结果到底说明了什么。

以后如果正式启动，这一层大概会关心：

- decision evaluation
- evidence log
- lesson admission
- review cadence

### 4.3 Evolution

最后才定义什么时候允许改自己。

以后如果正式启动，这一层大概会关心：

- `agent_strategy` 的 change gate
- review window
- rollback
- 后续是否允许放开 `lessons` 或 control rules

这三层没有消失，只是现在先不把它们当成当前工程主题。

---

## 5. 什么情况下再启动这条 roadmap

只有下面这些条件开始成立以后，才值得把这条 roadmap 从方向图变回主动开发路线。

### 5.1 下层 runtime 已经够稳

至少要先有：

- 上下文可观测
- Prompt Cache
- Auto compaction
- 基本 run trace

### 5.2 auto-trading 已经跑出足够样本

不是偶尔跑几轮，而是真的积累出一批可复盘的决策、执行和结果。

### 5.3 系统已经开始需要正式的 containment

也就是仅靠 broker guard 已经不够，需要系统自己决定什么时候该转入 `observe` 或 `contain`。

### 5.4 strategy 变更已经变成真实问题

也就是 `agent_strategy` 不再只是 prompt 里的一个 slot，而是真的开始出现：

- 何时该改
- 依据什么改
- 改完怎么看
- 变差了怎么回

这几个现实问题。

---

## 6. 如果以后启动，顺序还是这条

等这条 roadmap 真启动时，顺序我还是建议保持不变，只是现在先不做。

### T0：Readiness Gate

先确认下层 runtime 已经提供可依赖的 run、action、trace、state 视图。

### T1：Control Foundation

先把 mode、permissions、contain、no-op 这些正式化。

### T2：Learning Plane

再把 decision evaluation、evidence log、lesson admission 这些正式化。

### T3：Learning-to-Control

让系统开始根据学到的东西主动收缩行动空间。

### T4：Controlled Evolution of `agent_strategy`

只先放开 `agent_strategy`，不一次放开所有长期对象。

### T5：Broader Evolution Surface

只有前面跑稳以后，才考虑 `lessons` 的整理和更高风险的 control rule 变更。

---

## 7. 现在明确不做什么

这条文档当前明确不推进下面这些内容：

- 完整 control plane
- 正式 lesson admission system
- `agent_strategy` 的自动进化机制
- control rule self-editing
- 为 trading harness 单独重设计 runtime

这些内容不是错，只是现在太早。

---

## 8. 一句话总结

这份文档现在保留的是方向，不是排期。Flux 未来大概率还是会走向 `Control -> Learning -> Evolution`，但在你当前只需要自动压缩、Prompt Cache 和可观测性的阶段，还不值得把这条线正式开工。

---

## 参考资料

- [agent-harness-roadmap.md](/Users/glows777/codes/wcg/flux/docs/agent-harness-roadmap.md)
- [NIST: AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST: Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)
- [Atlassian: Technology roadmap](https://www.atlassian.com/agile/project-management/technology-roadmap)
