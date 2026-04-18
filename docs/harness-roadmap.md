# Flux Harness Roadmap

> 定位：这是一份针对 Flux 的 trading-system harness roadmap。它不讨论通用 agent infra，也不展开产品侧交互设计。它只回答一件事：Flux 这套 trading agent 系统，接下来会长成什么样的 harness，以及为什么按这个顺序长。
>
> 文档类型：这是一份 capability roadmap，不是架构口号，也不是实现 checklist。
>
> 最后更新：2026-04-18

---

## 1. 先把这份文档写成真正的 roadmap

上一版已经把 `Control / Learning / Evolution` 这条主线讲清楚了，但它更像一份方向说明，还不够像真正的 roadmap。

一份能拿来推进工作的 roadmap，至少要回答这些问题：

- 我们现在到底站在哪里
- 为什么这三层要按这个顺序推进
- 每个阶段到底交付什么
- 它依赖底下哪一层先准备好
- 做到什么程度才算阶段完成
- 哪些事情现在明确不做

这次重写的目标，就是把这些空白补上。

这里也先说明一下写法边界：这份文档先做成 **按能力里程碑推进的 roadmap**，不是按季度排死日期的排期表。原因和 agent harness 那份一样，现在最缺的不是日期，而是依赖顺序、退出标准和 rollout 边界。把里程碑先写实，比硬填季度更有用。

---

## 2. 这份 roadmap 处理哪一层

这份文档讨论的不是 runtime 本身，而是 **长在 runtime 上面的 trading-system harness**。

两层关系要先写清楚：

- 下层是 [agent-harness-roadmap.md](/Users/glows777/codes/wcg/flux/docs/agent-harness-roadmap.md)
  它负责 run contract、context、state、tools、permissions、telemetry、recovery
- 上层是这份 `Trading-System Harness`
  它负责 trading system 怎么控制自己、怎么解释结果、什么时候允许改自己

这两层不是替代关系，而是依赖关系。

如果底下的 agent harness 还没有把 `run state / action surface / trace / recovery` 这些东西稳定下来，上面的 trading harness 就只能继续靠 prompt、memory slot 和 guard 拼着跑。那样即使设计了再完整的 `Control / Learning / Evolution`，最后也会落回一堆软约束。

所以这条路的前提很明确：

**Trading-System Harness 不是绕过 runtime 另起一层，而是消费 Agent Harness 暴露出来的稳定能力面。**

---

## 3. 当前系统快照

### 3.1 现在已经有的资产

Flux 不是从零开始，它已经有不少跟 trading harness 相关的资产。

当前比较关键的基础在这些位置：

- [prompt.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/trading-agent/prompt.ts)
  交易 loop、无操作原则、`agent_strategy` 的使用方式已经写进 prompt
- [guard.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/broker/guard.ts)
  已经有单笔金额、冷却期、单日亏损这些硬边界
- [types.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/trading-agent/types.ts)
  已经有 heartbeat context、baseline、strategy path 这些对象
- [memory/types.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/memory/types.ts)
  已经有 `lessons`、`portfolio_thesis`、`agent_strategy` 这些长期对象
- [memory/loader.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/memory/loader.ts)
  `trading-agent` 已经会把 `portfolio_thesis`、`lessons` 等 slot 预加载进上下文
- [heartbeat/index.ts](/Users/glows777/codes/wcg/flux/packages/server/src/core/ai/plugins/heartbeat/index.ts)
  auto-trading 路径已经会同步订单、构建 heartbeat context、seed `agent_strategy`

如果只看“有没有零件”，现在其实已经不少了。

### 3.2 现在真正缺的不是零件，而是“成层”

现在的问题不在于没有这些对象，而在于这些对象还没有被收束成正式系统。

最明显的缺口有三类：

- `Control` 还散着
  一部分在 prompt，一部分在 guard，一部分在 agent 当轮推理里

- `Learning` 只有材料，还没有正式判断机制
  trade history、order reasoning、lessons、review prompt 都在，但没有清楚回答“什么值得学、什么只是噪声”

- `Evolution` 只有对象，没有机制
  `agent_strategy` 虽然已经存在，但什么时候允许改、依据什么改、怎么观察、怎么回滚，都还没有正式定义

### 3.3 现在最危险的地方

如果把当前状态压成一句话，大概是这样：

**Flux 现在已经有交易相关资产，但还没有把这些资产组织成真正的控制系统。**

这会带来几个很具体的问题：

- 系统知道怎么下单，但不稳定地知道什么时候应该不下单
- 系统会写 lesson，但不稳定地知道哪条 lesson 值得影响后面的行为
- 系统已经有 `agent_strategy`，但还没有正式 gate 去限制它什么时候允许改
- containment 现在更像 broker guard 的副产物，还不是 Control Plane 的正式结果

---

## 4. 这次重写参考了哪些外部实践

这份 roadmap 的结构和顺序，不是只从当前代码里倒出来的，也参考了几类外部实践。

### 4.1 roadmap 的写法参考

roadmap 本身的写法，主要参考了一般技术 roadmap 的基本结构：

- 明确 scope
- 明确 milestone
- 写清 dependency
- 给出 exit criteria
- 补上 risk 和 KPI

这类写法虽然朴素，但很重要。没有这些内容，roadmap 很容易重新退回成“方向判断文”。

### 4.2 AI 系统风险管理的参考

NIST AI RMF 和 GenAI Profile 对这份文档最有帮助的，不是具体术语，而是它们一直强调的那条顺序：

- 先定义 governance 和 risk boundary
- 再定义 measurement
- 最后才谈持续优化和适配

这跟 Flux 这条路是同一个方向：

- `Control` 对应“先定义允许怎么行动”
- `Learning` 对应“先定义怎样解释结果”
- `Evolution` 对应“最后才允许改自己”

### 4.3 agent 系统生产化的参考

OpenAI、Anthropic、LangGraph 这些资料对这份 trading roadmap 的意义，不是告诉我们怎么设计交易策略，而是提醒一件更底层的事：

**上层控制系统只有在底下已经有稳定的 run、state、action、trace、checkpoint 时，才可能真正成立。**

这也是为什么这份文档现在会明确写 dependency gate，而不再把 trading harness 写成“随时都能独立开工”的样子。

---

## 5. 北极星目标和工程原则

### 5.1 北极星目标不变

Flux 的北极星还是这一句：

**给定 end date，在那之前赚钱。**

这个目标不能变，但它也不能直接变成系统每天的局部优化函数。原因没有变：

- 它反馈太慢
- 噪声太大
- 很容易把运气误判成能力

所以 trading harness 真正要做的，不是直接拿“赚钱”当即时控制信号，而是在它前面补上一套更短反馈、更可解释、更能回滚的控制系统。

### 5.2 原则一：Control 先于 Learning，Learning 先于 Evolution

如果系统连当前允许做什么都没有正式定义，就没有稳定对象可评估；如果连结果怎么解释都没定义，就没有资格改策略。

### 5.3 原则二：无操作和 contain 必须是第一类结果

一个能持续运行的 trading system，不应该只有“继续交易”和“guard 挡住”这两种结局。`no-op`、`observe`、`contain` 都要成为正式结果。

### 5.4 原则三：lesson 不等于 strategy change

写下教训，只代表形成了候选学习信号，不代表它已经强到足以改动长期策略。

### 5.5 原则四：每次只放开一个进化对象

如果同时允许 strategy、lessons、control rules 一起变，最后几乎不可能解释“到底是哪一层改坏了”。

### 5.6 原则五：任何变更都要配 review window 和 rollback

没有观察窗口和回滚路径的 Evolution，不是进化，是直接放大错误。

---

## 6. 目标形态：三层，不多也不少

如果把目标形态收成最小版本，Flux 的 trading harness 最后还是三层。

### 6.1 Control Plane

`Control` 决定当前系统怎么行动。

它至少要正式拥有这些对象：

- `mode`
  当前运行模式，比如 `observe / probe / trade / contain`
- `permissions`
  当前模式下允许哪些动作
- `entry_conditions`
  某个动作发生前必须满足什么条件
- `risk_budget`
  当前允许消耗多少风险额度
- `containment_rules`
  什么情况出现后必须收缩、降级或停机
- `no_op_result`
  无操作不再是 fallback，而是正式结果

### 6.2 Learning Plane

`Learning` 决定系统怎么解释结果。

它至少要正式拥有这些对象：

- `decision_evaluation`
  对单次决策和阶段性表现的正式判断机制
- `evidence_log`
  哪些事实可以作为学习证据
- `lesson_rules`
  什么结果允许进入 lessons
- `promotion_rules`
  什么信号还只是复盘材料，什么信号足以影响 strategy
- `review_schedule`
  什么时候做阶段性复盘，而不是每轮都即时自我改写

### 6.3 Evolution Plane

`Evolution` 决定系统什么时候允许改自己。

它至少要正式拥有这些对象：

- `strategy_object`
  当前允许被进化的正式对象
- `promotion_threshold`
  什么证据强到足以触发变更
- `review_window`
  变更后观察多久、看哪些指标
- `rollback_rule`
  变差以后如何回滚
- `change_log`
  每次变更为什么发生、之后表现如何

---

## 7. 开工前的依赖 gate

这部分是上一版缺得最明显的地方。

这份 trading roadmap 不是“想做就能做”，它有明确的下层前置依赖。

至少要等 agent harness 先稳定暴露出下面这些能力面：

- 统一的 run contract
- 稳定的 action / permission surface
- 基本可用的 trace
- checkpoint / recovery 语义
- 能区分 planning、tool execution、delivery、persistence 的 run 结果

如果这些能力还没稳定，上层就只能继续把 control、learning、evolution 挂在 prompt 和 slot 上，最后会很难收成正式系统。

所以这条 roadmap 的第一个里程碑，不是直接做 trading 逻辑，而是先定义 **trading harness 对 agent harness 的 readiness gate**。

---

## 8. Roadmap 总览

| Window | Milestone | 主题 | 为什么现在做 | 退出标准 |
| --- | --- | --- | --- | --- |
| Now | H0 | Agent-harness readiness gate | 上层控制系统必须建立在稳定的 run / state / action / trace 上 | trading harness 所需的底层 surfaces 被明确列出并可消费 |
| Now | H1 | Control plane foundation | 先定义当前允许怎么行动，不然没有稳定评估对象 | mode、permissions、entry conditions、containment、no-op 成为正式系统对象 |
| Next | H2 | Learning plane | 先把结果翻译成可信学习信号，再谈优化 | decision evaluation、evidence log、lesson admission 成型 |
| Next | H3 | Learning-to-Control loop | 系统开始根据学到的东西主动收缩行动空间 | containment 不再只是 guard，而成为系统级控制结果 |
| Later | H4 | Controlled evolution of `agent_strategy` | 只有 Control 和 Learning 稳定后，才允许动策略 | strategy change gate、review window、rollback 成型 |
| Later | H5 | Broaden evolution surface carefully | 扩大战略对象前，先验证第一阶段进化机制可靠 | lessons curation 等更高风险对象才允许逐步放开 |

下面把每个里程碑展开。

---

## 9. H0：Agent-Harness Readiness Gate

### 9.1 目标

明确 trading harness 依赖底下哪些 surfaces，并把这些依赖从“脑中默认”变成文档化 gate。

### 9.2 为什么这是第一步

如果不先把前置条件写清楚，后面的讨论很容易滑回“上层直接补 prompt 和 memory 规则”。

那样看起来像在推进 harness，实际上只是继续把控制逻辑放在软约束里。

### 9.3 核心交付

- `TradingHarnessDependencyGate`
  至少列出：
  - run stage contract
  - action / permission surface
  - trace schema
  - checkpoint / recovery semantics

- 上下层接口说明
  明确 trading harness 会消费哪些对象，而不继续直接读 plugin internals

- 风险说明
  明确哪些 trading milestone 不能在下层缺失时假开工

### 9.4 依赖

- 依赖 [agent-harness-roadmap.md](/Users/glows777/codes/wcg/flux/docs/agent-harness-roadmap.md) 的 M0-M3 逐步落地

### 9.5 完成标准

- trading harness 所需的底层能力面被写清楚
- 上下层边界不再靠口头约定
- 后续 trading milestones 都能指出自己依赖哪条底层 surface

---

## 10. H1：Control Plane Foundation

### 10.1 目标

先把“当前系统允许怎么行动”正式化。

### 10.2 为什么先做这个

如果 Control 不先立住，后面的 Learning 和 Evolution 都没有稳定对象。系统连“当前允许做什么”都没有正式定义，就谈不上“做得好不好”，更谈不上“要不要改自己”。

### 10.3 核心交付

- 正式的运行模式，而不是只靠 prompt 暗示
- `permissions`
  当前 mode 下允许的动作集合
- `entry_conditions`
  某个动作发生前必须满足的条件
- `risk_budget`
  当前轮次或当前窗口能消耗的风险额度
- `containment_rules`
  包括 drawdown、连续错误模式、纪律违规后的收缩逻辑
- `no_op_result`
  无操作作为正式结果，而不是 fallback
- 与 broker guard 的边界
  明确 guard 是最后一道硬边界，不再承担全部 control 语义

### 10.4 依赖

- 依赖 H0
- 依赖 agent harness 暴露稳定 action / permission surface

### 10.5 完成标准

- Flux 不再只靠 prompt 驱动交易行为
- 当前行动空间和停止条件可以从系统层读出来
- “为什么这轮能交易 / 不能交易 / 应该不动” 可以被系统解释
- contain 不再只是 broker guard 的副产物

---

## 11. H2：Learning Plane

### 11.1 目标

让系统能更早知道自己是不是在朝着赚钱方向走。

### 11.2 为什么第二个做这个

在 trading 里，只看最终赚钱太慢。系统必须先学会解释结果，才能知道哪些模式该继续，哪些模式该警惕。

### 11.3 核心交付

- `decision_evaluation`
  对单次决策质量的正式判断机制
- `evidence_log`
  把 trade history、order reasoning、market context、后验表现连起来
- `lesson_rules`
  明确什么样的证据允许进入 `lessons`
- `promotion_rules`
  明确什么信号只能留在复盘层，什么信号有资格影响 strategy
- `review_schedule`
  明确哪些是即时反馈，哪些要按周期复盘

### 11.4 依赖

- 依赖 H1 的 control objects
- 依赖 agent harness 的 trace / state surface

### 11.5 完成标准

- 系统能区分“赚钱”和“做对”
- 侥幸盈利不再自动强化 strategy
- 高质量但短期亏损的样本不再被立即误杀
- `lessons` 不再只是 append-only 材料，而开始有进入规则

---

## 12. H3：Learning-to-Control Loop

### 12.1 目标

把“做错了怎么收住”从 broker 风控，推进到系统级收敛能力。

### 12.2 为什么这一步独立存在

前两阶段做完以后，Flux 才第一次同时拥有：

- 当前怎么行动的正式控制面
- 结果怎么解释的正式学习面

这时候系统才真正有条件做一件以前做不到的事：

**根据已经学到的东西，主动收缩自己的行动空间。**

### 12.3 核心交付

- 连续低质量决策触发 mode downgrade
- 连续违反风险纪律触发更保守运行
- drawdown、错误模式、近期 strategy 表现进入 containment 判断
- `contain`
  不再只是 guard，而成为 Control Plane 的正式 mode
- `observe`
  作为 recover / cool-down 的正式运行模式

### 12.4 依赖

- 依赖 H1 和 H2

### 12.5 完成标准

- Flux 不只会挡坏单，还会在系统跑偏时主动收缩
- contain 不再只存在于 broker guard
- “无操作”“观察模式”“收缩风险”开始成为系统级结果

---

## 13. H4：Controlled Evolution of `agent_strategy`

### 13.1 目标

把策略进化从 prompt 愿望，变成受证据约束的系统能力。

### 13.2 为什么这一步必须晚

Evolution 是最贵、也最危险的动作。前面三阶段如果不稳，Evolution 只会把错误放大。

所以这一步不是“让 agent 更自由”，而是反过来：

**只有当前面的 Control 和 Learning 都已经立住，系统才有资格开始改自己。**

### 13.3 核心交付

- `strategy_object`
  当前第一阶段只允许 `agent_strategy`
- `promotion_threshold`
  从 lessons / evidence 到 strategy change 的门槛
- `review_window`
  变更后观察多久、看哪些指标
- `rollback_rule`
  什么时候必须回滚
- `change_log`
  记录每次 strategy 变更的因果链

### 13.4 依赖

- 依赖 H1-H3

### 13.5 完成标准

- strategy 不再因为短期结果频繁抖动
- Evolution 不再靠 agent 主观“觉得该改”
- 变更、观察、回滚开始成为正式系统流程

---

## 14. H5：谨慎放开更大的 Evolution Surface

### 14.1 目标

在 `agent_strategy` 的进化机制稳定之后，才逐步考虑放开更大的长期对象。

### 14.2 为什么要单独列一层

这一层最容易被提前做，但也最容易让系统失控。

如果 strategy、lessons、control rules 同时允许修改，最后几乎无法回答：

- 是哪一层改坏了
- 哪个证据链不足
- 回滚该回哪一层

### 14.3 rollout 顺序

- `v1`
  只允许更新 `agent_strategy`
- `v2`
  才考虑让 `lessons` 从 append-only 材料变成可整理、可合并、可淘汰的长期规则对象
- `v3`
  最后才考虑触碰 `control` 相关对象，比如 mode 切换规则、permissions、entry conditions、containment 阈值

### 14.4 依赖

- 依赖 H4 被证明稳定

### 14.5 完成标准

- 扩大进化对象不会破坏问题定位能力
- 每一层变更都有独立 review window 和 rollback
- 上层 evolution 不会反过来绕过 control plane

---

## 15. 验证轨道与 KPI

roadmap 如果没有验证轨道，很快就会重新退回成观点文。

### 15.1 验证轨道

- control plane policy tests
- mode transition tests
- no-op / contain path tests
- decision evaluation tests
- lesson admission tests
- strategy promotion gate tests
- rollback tests
- regression coverage for both `trading-agent` and `auto-trading-agent`

### 15.2 运行指标

建议至少跟下面这些指标：

- `mode_transition_reason_coverage`
  mode 切换是否都能被解释

- `no_op_rate`
  系统选择无操作的比例

- `contain_trigger_rate`
  containment 触发频率和主要原因

- `lesson_admission_rate`
  有多少复盘信号真正进入 lessons

- `promotion_to_strategy_rate`
  lessons / evidence 有多少最终升级到 strategy 变更

- `strategy_change_success_rate`
  strategy 变更后，在 review window 内被保留的比例

- `rollback_rate`
  strategy 变更后被回滚的比例

- `false_confidence_rate`
  赚钱但评价不佳、或亏钱但评价良好的样本比例

---

## 16. 主要风险与缓解

### 16.1 过早谈 Evolution

风险：
在 Control 和 Learning 还没稳定前，系统已经开始频繁改 strategy。

缓解：
把 `agent_strategy` 之外的进化对象明确后置，先立 promotion gate。

### 16.2 把 guard 当成全部 control

风险：
系统看起来有风控，但实际上只是在下单最后一刻被动拦截。

缓解：
H1 里明确 `mode / permissions / no-op / contain` 是正式对象，guard 只是最后一道硬边界。

### 16.3 lesson 污染

风险：
短期噪声、偶然盈利、模糊复盘进入 lessons，污染后续策略。

缓解：
H2 先立 `lesson_rules` 和 `promotion_rules`，不让每条复盘都直接变成长期规则。

### 16.4 containment 只停留在口头

风险：
contain 只出现在文档和 prompt 里，系统层并没有真的 mode downgrade。

缓解：
H3 把 containment 写成 mode transition 和 policy outcome，而不是抽象愿望。

### 16.5 同时放开多个进化对象

风险：
strategy、lessons、control rules 一起动，最后无法解释成败，也没法回滚。

缓解：
H5 明确 rollout 顺序，一次只放开一个 evolution surface。

---

## 17. 暂时不做什么

这条 roadmap 当前明确不处理下面这些内容：

- 通用 agent platform 能力建设
- 产品页面和交互结构
- 完整的用户使用流程设计
- 不受约束的全自治策略进化
- 在 agent harness 未稳定前，直接上 trading-system evolution
- 为了“看起来聪明”而提前放开 control rule self-editing

---

## 18. 一句话总结

如果把这份文档压成一句话，我保留这一句：

**Flux 的 trading-system harness，是让 trading agent 在追求 end date 前赚钱这件事时，先知道当前允许怎么行动，再知道结果说明了什么，最后才在证据足够的时候允许自己改变；它不是 prompt 上再加几条规则，而是建立在 agent harness 之上的正式控制系统。**

---

## 参考资料

- 项目内相关文档见 [agent-harness-roadmap.md](/Users/glows777/codes/wcg/flux/docs/agent-harness-roadmap.md)
- [NIST: AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST: AI RMF 1.0](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10)
- [NIST: Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)
- [OpenAI: A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- [Anthropic: Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [LangGraph: Durable execution](https://docs.langchain.com/oss/javascript/langgraph/durable-execution)
- [OpenTelemetry: Semantic conventions for generative AI systems](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [Atlassian: Technology roadmap](https://www.atlassian.com/agile/project-management/technology-roadmap)
