# Flux Harness Roadmap

> 定位：这是一份针对 Flux 的 harness roadmap。它不讨论通用 agent infra，也不展开产品侧决策工作流和长期学习闭环。它只回答一件事：Flux 这套 trading agent 系统，接下来会长成什么样的 harness，以及为什么按这个顺序长。
>
> 最后更新：2026-04-17

---

## 1. 我们现在到底在做什么

Flux 现在已经不是“要不要做 agent”的阶段了。

统一入口、双 agent preset、session、memory、多模型、tool calling，这些骨架都已经在。现在真正的问题，不是再拼一个会聊天、会调工具的新 agent，而是这套 trading system 到底靠什么稳定运行，靠什么判断自己是不是在变好，靠什么在做错时收住。

所以这条 roadmap 讨论的不是 runtime 本身，也不是某条具体 workflow，而是 Flux 的 harness。

这里说的 harness，可以直接理解成：

**它是 trading system 外面那层控制系统。**

runtime 负责把一次请求跑起来，workflow 负责描述一条业务流程怎么走，harness 负责的是更底层的事：

- 当前系统允许追什么
- 当前系统允许做什么
- 系统怎么解释结果
- 系统什么时候允许改自己
- 系统做错时怎么收住

对 Flux 来说，真正要长出来的是这层东西。

---

## 2. 为什么最后会收束成 Control、Learning、Evolution

Flux 的北极星其实很简单：

**给定 end date，在那之前赚钱。**

这个目标必须保留，而且应该一直是最终裁判。但它不能直接拿来驱动系统每天怎么行动。原因也很现实：

- 它太慢，很多问题要过很久才看出来
- 它噪声很大，短期结果经常和长期有效性错位
- 它很容易被运气污染，坏决策也可能短期赚钱

所以如果 Flux 真的要围绕“赚钱”运行，它中间还得补上三层能力。

### 2.1 为什么先是 Control

如果系统连“当前允许做什么”都没有正式定义，它就只能继续靠 prompt、guard 和临时推理拼着跑。

这样的问题不是它不会交易，而是：

- 它不知道当前这一轮该追什么
- 它不知道什么时候应该无操作
- 它不知道什么时候应该进入更保守的模式

所以第一层必须是 `Control`。先把行动空间、风险边界和停止条件立住，系统才有资格持续运行。

### 2.2 为什么第二层是 Learning

即使有了 Control，系统也还是会遇到一个更难的问题：

**结果出来以后，这件事到底说明了什么。**

在 trading 里，赚钱不一定代表做对，亏钱也不一定代表做错。如果没有一层专门去解释结果，Flux 会很快学坏：

- 侥幸赚钱的坏习惯会被强化
- 高质量但短期亏损的决策会被误杀
- lessons 会被噪声污染

所以第二层必须是 `Learning`。它负责把结果翻译成系统还能继续用的判断。

### 2.3 为什么第三层才是 Evolution

即使系统已经学到一些东西，也不代表它立刻就应该改自己。

“学到教训”和“允许改策略”不是一回事。中间还隔着几件更危险的事：

- 证据够不够
- 这是不是短期噪声
- 改完以后怎么观察
- 变差了怎么回滚

所以第三层才是 `Evolution`。它不负责记录结果，也不负责解释结果，它只负责一件事：

**在证据足够的时候，允许系统以受约束的方式改变自己。**

这就是为什么这份 roadmap 最后只保留三层：

- `Control`
- `Learning`
- `Evolution`

不是因为这个名字更好看，而是因为 Flux 这套 trading harness 的因果链最后就会落到这三件事上。

---

## 3. Flux 现在站在哪里

Flux 不是从零开始，它已经有一套能跑的 agent system。

现在已经有的部分很明确：

- 有统一入口和双 agent 形态，`trading-agent` 负责交互式分析，`auto-trading-agent` 负责定时自主执行
- 有 runtime、preset、plugin、session、memory、tools、多模型这些执行骨架
- 有持久化的 trade history 和 order reasoning
- 有 `lessons`、`portfolio_thesis`、`agent_strategy` 这些长期对象
- 有 broker guard，能挡住一部分明显危险的动作

问题不在于系统没有能力，而在于这些能力还没有被收束成真正的 harness。

### 3.1 当前的 Control 还散着

现在和控制有关的东西主要分散在三处：

- prompt 里有交易 loop、无操作原则、一些前置检查
- guard 里有单笔金额、冷却期、单日亏损这些边界
- trading tools 和 heartbeat context 提供了动作接口和运行输入

这些零件已经存在，但它们还没有形成一个正式的 Control Plane。结果就是系统能挡住一部分坏动作，却还不太知道自己当前应该处在什么运行模式里。

### 3.2 当前的 Learning 只有材料，还没有成层

现在已经有很多学习材料：

- trade history
- order reasoning
- lessons
- portfolio thesis
- review prompt
- memory tools

但这些东西大多还停留在“记录”和“复盘素材”层面，系统还没有正式回答这些问题：

- 什么结果值得学
- 什么结果只是噪声
- 什么应该进入 lessons
- 什么还不够强，不能影响后面的 strategy

所以现在 Flux 已经有学习材料，但还没有真正的 Learning Plane。

### 3.3 当前的 Evolution 只有对象，没有机制

现在最接近正式进化对象的是 `agent_strategy`：

- 它已经是 memory slot
- 已经有版本历史
- 系统已经会 seed 初始版本
- prompt 里也已经把它当作策略文件

但现在缺的不是“能不能改 strategy”，而是更关键的几件事：

- 什么时候允许改
- 什么证据才够改
- 改完以后观察多久
- 变差了怎么回滚

所以当前 Flux 的状态可以压成一句话：

**已经有 runtime，也已经有不少 trading 相关资产，但还没有把这些资产组织成一个真正的 harness。**

---

## 4. Flux 最后会长成什么样的 harness

如果把目标形态收成最小版本，Flux 的 harness 最后会是三层。

### 4.1 Control Plane

`Control` 决定当前系统如何行动。

它至少要正式拥有这些对象：

- `mode`
  当前运行模式，比如 `observe / probe / trade / contain`
- `permissions`
  当前模式下允许哪些动作
- `entry_conditions`
  某个动作发生前必须满足什么条件
- `containment_rules`
  什么情况出现后必须收缩、降级或停机

这一层立起来以后，Flux 不再是“agent 想交易，然后 guard 挡一挡”，而会变成“系统先决定当前允许怎样交易，agent 再在许可范围内行动”。

### 4.2 Learning Plane

`Learning` 决定系统如何解释结果。

它至少要正式拥有这些对象：

- `decision_evaluation`
  对单次决策和阶段性结果的正式判断机制
- `evidence_log`
  哪些事实可以作为学习证据
- `lesson_rules`
  什么结果允许进入 lessons
- `promotion_rules`
  什么信号还只是复盘材料，什么信号已经足够强，可以继续送给 Evolution

这一层立起来以后，Flux 不再只是“有很多复盘素材”，而会开始真正区分：

- 赚钱和做对
- 亏钱和做错
- 可以学习的信号和不该强化的噪声

### 4.3 Evolution Plane

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

这一层立起来以后，Flux 不再是“agent 觉得该改 strategy 就改”，而会变成“只有满足证据门槛，系统才允许以受约束的方式改动策略”。

---

## 5. Roadmap

这条 roadmap 的顺序，不是按通用 infra 模块排，也不是按代码目录排，而是按 Flux 这套 harness 必须先长出什么来排。

### Phase 1：先立住 Control

#### 目标

先把当前系统允许怎么行动这件事立住。

#### 为什么先做这个

如果 Control 不先立住，后面的 Learning 和 Evolution 都没有稳定对象。系统连“当前允许做什么”都没有正式定义，就谈不上“做得好不好”，更谈不上“要不要改自己”。

#### 核心交付

- 正式的运行模式，而不是只靠 prompt 暗示
- 动作许可和前置条件
- 无操作作为正式结果，而不是 fallback
- 从 prompt 里提出来的 containment 规则

#### 完成标准

- Flux 不再只靠 prompt 驱动交易行为
- 当前行动空间和停止条件可以从系统层读出来
- agent 开始在系统许可范围内行动，而不是反过来

### Phase 2：再立住 Learning

#### 目标

让系统能更早知道自己是不是在朝着赚钱方向走。

#### 为什么第二个做这个

在 trading 里，只看最终赚钱太慢。系统必须先学会解释结果，才能知道哪些模式该继续，哪些模式该警惕。

#### 核心交付

- 正式的决策评估机制
- order reasoning、trade history、review flow 进入 Learning Plane
- lessons 的进入规则
- 从结果到学习信号的转换规则

#### 完成标准

- 系统能区分“赚钱”和“做对”
- 侥幸盈利不再自动强化 strategy
- 高质量但短期亏损的样本不再被立即误杀
- memory、review、trade history 不再只是散的材料

### Phase 3：把 Learning 接回 Control，让系统真的会收住

#### 目标

把“做错了怎么收住”从 broker 风控，推进到系统级收敛能力。

#### 为什么这个阶段独立存在

前两阶段做完以后，Flux 才第一次同时拥有：

- 当前怎么行动的正式控制面
- 结果怎么解释的正式学习面

这时候系统才真正有条件做一件以前做不到的事：

**根据已经学到的东西，主动收缩自己的行动空间。**

#### 核心交付

- 连续低质量决策触发模式收缩
- 连续违反风险纪律触发更保守运行
- drawdown、错误模式、近期 strategy 表现进入 containment 判断
- contain 不再只是 guard，而成为 Control 的正式模式

#### 完成标准

- Flux 不只会挡坏单，还会在系统跑偏时主动收缩
- contain 不再只存在于 broker guard
- “无操作”“减仓”“观察模式”开始成为系统级结果

### Phase 4：最后才放开 Evolution

#### 目标

把策略进化从 prompt 愿望，变成受证据约束的系统能力。

#### 为什么最后才做这个

Evolution 是最贵、也最危险的动作。前面三阶段如果不稳，Evolution 只会把错误放大。

所以这一步不是“让 agent 更自由”，而是反过来：

**只有当前面的 Control 和 Learning 都已经立住，系统才有资格开始改自己。**

#### 核心交付

- strategy 变更门槛
- 从 lessons 和长期证据到 strategy 的提升路径
- 变更后的 review window
- rollback 机制

#### 完成标准

- strategy 不再因为短期结果频繁抖动
- Evolution 不再靠 agent 主观“觉得该改”
- 变更、观察、回滚开始成为正式系统流程

---

## 6. Evolution 的放开顺序

这一段要单独写清楚，因为它决定了 Flux 后面会不会失控。

### v1：只允许更新 `agent_strategy`

这是当前 roadmap 应该写死的边界。

这一阶段里，系统可以继续写 lessons，也可以继续复盘，但真正允许被 Evolution 修改的正式对象，只有 `agent_strategy`。

原因很简单：这是现阶段最成熟、风险也最低的进化对象。

### v2：后面可能允许更新 `lessons`

这里不是说系统第一次能写 lesson。现在它已经能追加 lesson 了。

这里真正要放开的，是另一件事：

`lessons` 不再只是学习材料或追加日志，而开始变成可以被整理、重写、合并、淘汰的长期规则对象。

也就是说，v2 放开的不是写入动作本身，而是 **lesson curation**。

### v3：最后才可能允许更新 `control`

这是最晚放开的阶段。

这里指的不是 prompt 文本，而是更靠近控制面的对象，比如：

- mode 切换规则
- permissions
- entry conditions
- containment 阈值
- 风险参数

这一步一旦出错，影响的就不是分析思路，而是整个 trading system 的行动边界。所以它只能建立在前面几层已经稳定之后，不能提前。

---

## 7. 暂时不做什么

这条 roadmap 当前不处理下面这些内容：

- 产品层的决策工作流
- 用户每天怎样使用 Flux
- 产品页面和交互结构
- 完整的观察与学习闭环文档
- 通用 agent platform 能力建设
- 一上来就追求完整自治系统

这些都重要，但它们不是这条 harness 主线现在最先要接住的事。

---

## 8. 一句话总结

如果把这份文档压成一句话，我保留这一句：

**Flux 的 harness，是让 trading system 在追求 end date 之前赚钱这件事时，先知道当前允许怎么行动，再知道结果说明了什么，最后才在证据足够的时候允许自己改变。**
