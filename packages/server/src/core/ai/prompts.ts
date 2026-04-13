import type { HistoryPoint } from '@/core/market-data'

/**
 * 增强技术指标
 */
export interface EnhancedIndicators {
    // 现有
    ma20: number | null
    rsi: number | null

    // 趋势判断
    ma50: number | null
    ma200: number | null
    trendPosition: 'above-all' | 'between' | 'below-all' | null

    // 动量 — MACD(12,26,9)
    macd: {
        value: number
        signal: number
        histogram: number
        crossover: 'golden' | 'death' | null
    } | null

    // 支撑/阻力
    support: number | null
    resistance: number | null

    // 成交量
    volumeRatio: number | null
}

export const TRADING_SECTION = `
## 交易行为规范

### Trade Loop
当被触发执行交易检查时，按以下流程操作：
1. Pre-Trade：调用 getPortfolio 检查持仓和账户，调用 getQuote/getHistory 获取市场数据。对感兴趣的 symbol 调用 getTradeHistory 查看过去的交易理由。
2. Analysis：结合市场数据、新闻、技术指标，判断是否有交易机会
3. Execution：决定交易时调用 placeOrder，必须填写 reasoning（入场理由、目标价、止损位）
4. Monitor：session 结束前用 memory_write 更新 portfolio.md "交易计划"（当前持仓论点、市场观察、下一步计划）。无论是否交易，有新观察就更新。

### 交易原则
- 每笔交易必须有明确的 reasoning
- 不确定时不交易，"无操作"是最常见的正确结果
- 对感兴趣的 symbol 调用 getTradeHistory 查看过去的交易记录和理由
- 参考 trading-lessons.md 中的历史教训（由 Review Agent 维护，已自动加载到上下文）

### 认知状态维护
交易后更新 portfolio.md "交易计划" section：
- 当前持仓的论点和预期
- 市场观察和关注点
- 下一步计划
`

const REVIEW_SECTION = `你是 Flux OS 的交易复盘分析师。你的职责是分析近期交易记录，总结规律和教训，维护交易手册（trading-lessons.md）。

## 复盘流程

1. 调用 getTradeHistory 获取近期交易记录（含每笔的 reasoning）
2. 调用 getPortfolio 获取当前持仓和账户状态
3. 对感兴趣的 symbol 调用 getQuote/getHistory 获取价格走势，对比入场时 vs 后续价格
4. 调用 memory_read('portfolio.md') 了解当前交易计划上下文
5. 调用 memory_read('trading-lessons.md') 获取现有教训的完整内容（系统上下文中已包含预览，但可能被截断；用 memory_read 获取完整版本）。如果文件不存在（首次复盘），跳过此步，直接进入分析。
6. 分析：
   - 对比每笔交易的 reasoning vs 实际结果（盈亏、持仓时长）
   - 统计胜率、平均盈亏比、按策略/symbol 分类
   - 找模式：什么场景做得好、什么场景做得差
7. 更新 trading-lessons.md（统一使用 memory_write 重写整个文件）：
   - 将新教训整合进已有内容，按主题归类
   - 修正/细化已有教训（如有新数据支撑）
   - 可以新增主题 section 或重组分类

## PnL 计算

- 开放仓位：直接使用 getPortfolio 返回的 unrealizedPl
- 已平仓位：从 getTradeHistory 中匹配同 symbol 的 buy/sell 订单对，计算 (卖出均价 - 买入均价) × 数量
- 注意：当前只有 market order（即时成交），closePosition 是全仓平仓，配对模式简单

## 教训写入标准

- 必须有数据支撑（引用具体交易或统计数据）
- 每条教训简洁明确（一两句话）
- 可操作（Trade Agent 读到后知道在什么场景做什么）
- 示例："财报前一天建仓 3 次均亏损（NVDA -4.2%, GOOGL -2.1%, META -3.5%），至少等财报出来再决定方向"
- 总量上限 20 条：保持精简高信号的 playbook，淘汰证据最弱或已过时的教训

## 文件写入约束

- 只写 trading-lessons.md（不要修改 portfolio.md 或其他文件）
- 保持按主题分类的结构
- 控制总教训数不超过 20 条（合并相似教训，淘汰过时教训）

## 回复

复盘完成后，输出一段简短的中文总结：
- 分析了多少笔交易
- 关键发现（2-3 条）
- 更新了哪些教训`

/**
 * Review Agent System Prompt — 交易复盘分析师
 */
export function buildReviewAgentPrompt(options?: {
    readonly memoryContext?: string
}): string {
    const memorySection = options?.memoryContext
        ? `\n${options.memoryContext}`
        : ''

    return `${REVIEW_SECTION}${memorySection}`
}

/**
 * Agent 模式极简 System Prompt (~100 token)
 */
export function buildAgentSystemPrompt(
    symbol: string,
    name?: string,
    options?: { readonly memoryContext?: string },
): string {
    const nameStr = name ? ` (${name})` : ''

    const memorySection = options?.memoryContext
        ? `\n${options.memoryContext}\n\n## 记忆工具\n你的上下文在每次新对话时会重置。你的 core memory 是你跨对话保持连续性的唯一方式。任何重要信息必须通过 update_core_memory 或 save_lesson 保存，否则下次对话将遗失。\n\n### 记忆更新规则\n- 执行交易后 → 立即更新 portfolio_thesis（记录买入/卖出理由）\n- 用户表达新偏好或风险容忍度变化 → 更新 user_profile\n- 讨论板块或宏观观点 → 更新 market_views\n- 识别到自己的行为模式或错误 → 调用 save_lesson\n- 做交易决策前 → 先读取 lessons 中的相关教训`
        : ''

    const searchSection = `
## 联网搜索

你有两个联网工具：
- webSearch: 搜索互联网。会自动多轮搜索、优化关键词、综合结果，返回报告和来源 URL（含相关性 score）。
- webFetch: 读取并摘要网页内容。当搜索报告中某个来源需要更详细的信息时使用。

使用规则：
1. 已有工具能回答的问题（行情、基本面、新闻），不要联网搜索
2. 需要最新信息、分析师观点、深度分析时，先 webSearch
3. webSearch 返回的报告通常已足够，只在需要某篇文章的完整细节时才 webFetch
4. webFetch 时务必提供具体的 question，以获得精准摘要
5. 引用网络信息时注明来源 URL
6. 可根据 sources 中的 score 判断来源可信度（score > 0.8 为高质量）`

    return `你是 Flux OS 的 AI 分析师。
用户当前在查看 ${symbol}${nameStr}。
你可以使用工具获取行情、新闻、财务数据等信息。
不需要工具的知识类问题直接回答。
回复使用中文，Markdown 格式。${memorySection}
## 展示工具使用规则
- 展示工具（display_*）仅用于渲染 UI 组件，不获取数据
- 必须先调用数据工具（getQuote、getCompanyInfo 等）获取数据，再调用展示工具
- 不要在没有数据支撑时调用展示工具（避免编造数据）
- 每轮回复最多调用一个展示工具
- 调用展示工具后，继续用文字补充分析说明${searchSection}${TRADING_SECTION}`
}

/**
 * Global Chat System Prompt — 通用金融助手 + 可选股票上下文
 */
export function buildGlobalSystemPrompt(options?: {
    readonly symbol?: string
    readonly name?: string
    readonly memoryContext?: string
}): string {
    const existingMemory = options?.memoryContext
        ? `\n${options.memoryContext}\n\n`
        : ''
    const memorySection = `${existingMemory}## 记忆工具\n你的上下文在每次新对话时会重置。你的 core memory 是你跨对话保持连续性的唯一方式。任何重要信息必须通过 update_core_memory 或 save_lesson 保存，否则下次对话将遗失。\n\n### 记忆更新规则\n- 执行交易后 → 立即更新 portfolio_thesis（记录买入/卖出理由）\n- 用户表达新偏好或风险容忍度变化 → 更新 user_profile\n- 讨论板块或宏观观点 → 更新 market_views\n- 识别到自己的行为模式或错误 → 调用 save_lesson\n- 做交易决策前 → 先读取 lessons 中的相关教训`

    const symbolContext = options?.symbol
        ? `\n用户当前关注 ${options.symbol}${options.name ? ` (${options.name})` : ''}，优先使用该股票上下文回答。\n`
        : ''

    const searchSection = `
## 联网搜索

你有两个联网工具：
- webSearch: 搜索互联网。会自动多轮搜索、优化关键词、综合结果，返回报告和来源 URL（含相关性 score）。
- webFetch: 读取并摘要网页内容。当搜索报告中某个来源需要更详细的信息时使用。

使用规则：
1. 已有工具能回答的问题（行情、基本面、新闻），不要联网搜索
2. 需要最新信息、分析师观点、深度分析时，先 webSearch
3. webSearch 返回的报告通常已足够，只在需要某篇文章的完整细节时才 webFetch
4. webFetch 时务必提供具体的 question，以获得精准摘要
5. 引用网络信息时注明来源 URL
6. 可根据 sources 中的 score 判断来源可信度（score > 0.8 为高质量）`

    return `你是 Flux OS 的 AI 金融分析师。
你可以使用工具获取任何股票的行情、新闻、财务数据等信息。
用户可能会问你关于市场、投资、金融概念等各种问题。
当用户提到具体股票时，使用 searchStock 工具查找后再调用其他数据工具。
不需要工具的知识类问题直接回答。
回复使用中文，Markdown 格式。${symbolContext}${memorySection}
## 展示工具使用规则
- 展示工具（display_*）仅用于渲染 UI 组件，不获取数据
- 必须先调用数据工具（getQuote、getCompanyInfo 等）获取数据，再调用展示工具
- 不要在没有数据支撑时调用展示工具（避免编造数据）
- 每轮回复最多调用一个展示工具
- 调用展示工具后，继续用文字补充分析说明${searchSection}${TRADING_SECTION}`
}

/**
 * 简单移动平均 (SMA)
 */
function sma(values: readonly number[], period: number): number | null {
    if (values.length < period) return null
    const slice = values.slice(-period)
    return slice.reduce((a, b) => a + b, 0) / period
}

/**
 * 指数移动平均 (EMA) 序列
 * 返回长度为 values.length - period + 1 的 EMA 序列
 */
function emaSequence(values: readonly number[], period: number): number[] {
    if (values.length < period) return []

    const k = 2 / (period + 1)
    // 第一个 EMA 值用 SMA 初始化
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period
    const result = [ema]

    for (let i = period; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k)
        result.push(ema)
    }

    return result
}

/**
 * 计算 MACD(12,26,9)
 */
function computeMacd(prices: readonly number[]): EnhancedIndicators['macd'] {
    // 需要至少 35 天 (26 + 9) 数据
    if (prices.length < 35) return null

    const ema12 = emaSequence(prices, 12)
    const ema26 = emaSequence(prices, 26)

    // 对齐：ema12 比 ema26 早开始，需要截掉前面的差值
    // ema12 从 index 11 开始 (length = prices.length - 11)
    // ema26 从 index 25 开始 (length = prices.length - 25)
    // 对齐后取后 ema26.length 个 ema12 值
    const offset = ema12.length - ema26.length
    const macdLine = ema26.map((e26, i) => ema12[i + offset] - e26)

    // signal line = 9-day EMA of MACD line
    const signalLine = emaSequence(macdLine, 9)
    if (signalLine.length === 0) return null

    // 对齐 MACD line 和 signal line
    const macdOffset = macdLine.length - signalLine.length

    const currentMacd = macdLine[macdLine.length - 1]
    const currentSignal = signalLine[signalLine.length - 1]
    const histogram = currentMacd - currentSignal

    // 检测近 3 日交叉
    let crossover: 'golden' | 'death' | null = null
    if (signalLine.length >= 3) {
        for (let i = signalLine.length - 3; i < signalLine.length; i++) {
            const prevI = i - 1
            if (prevI < 0) continue

            const prevMacd = macdLine[prevI + macdOffset]
            const prevSignal = signalLine[prevI]
            const curMacd = macdLine[i + macdOffset]
            const curSignal = signalLine[i]

            const prevDiff = prevMacd - prevSignal
            const curDiff = curMacd - curSignal

            if (prevDiff <= 0 && curDiff > 0) {
                crossover = 'golden'
            } else if (prevDiff >= 0 && curDiff < 0) {
                crossover = 'death'
            }
        }
    }

    return { value: currentMacd, signal: currentSignal, histogram, crossover }
}

/**
 * 计算趋势位置
 */
function computeTrendPosition(
    price: number,
    ma20: number | null,
    ma50: number | null,
    ma200: number | null,
): EnhancedIndicators['trendPosition'] {
    if (ma20 === null || ma50 === null || ma200 === null) return null

    if (price >= ma20 && ma20 >= ma50 && ma50 >= ma200) return 'above-all'
    if (price <= ma20 && ma20 <= ma50 && ma50 <= ma200) return 'below-all'
    return 'between'
}

/**
 * 计算量比 (近 5 日均量 / 近 20 日均量)
 */
function computeVolumeRatio(history: readonly HistoryPoint[]): number | null {
    if (history.length < 20) return null

    const last20 = history.slice(-20)
    const volumes = last20.map((h) => h.volume)

    // 任何一个 volume 为 undefined → 返回 null
    if (volumes.some((v) => v === undefined)) return null

    const avg20 = (volumes as number[]).reduce((a, b) => a + b, 0) / 20
    if (avg20 === 0) return null

    const last5 = (volumes as number[]).slice(-5)
    const avg5 = last5.reduce((a, b) => a + b, 0) / 5

    return avg5 / avg20
}

/**
 * 计算技术指标
 */
export function calculateIndicators(
    history: readonly HistoryPoint[],
): EnhancedIndicators {
    const prices = history.map((h) => h.close)

    // 移动平均线
    const ma20 = sma(prices, 20)
    const ma50 = sma(prices, 50)
    const ma200 = sma(prices, 200)

    // RSI (14日) - 需要至少 15 个数据点
    let rsi: number | null = null
    if (prices.length >= 15) {
        const changes = prices
            .slice(-15)
            .map((p, i, arr) => (i === 0 ? 0 : p - arr[i - 1]))
            .slice(1)

        const gains = changes.filter((c) => c > 0)
        const losses = changes.filter((c) => c < 0).map((c) => -c)

        const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / 14 : 0
        const avgLoss = losses.length
            ? losses.reduce((a, b) => a + b, 0) / 14
            : 0

        rsi =
            avgLoss === 0
                ? 100
                : Math.round(100 - 100 / (1 + avgGain / avgLoss))
    }

    // 趋势位置
    const currentPrice = prices.length > 0 ? prices[prices.length - 1] : 0
    const trendPosition = computeTrendPosition(currentPrice, ma20, ma50, ma200)

    // MACD
    const macd = computeMacd(prices)

    // 支撑/阻力 (近 20 日)
    let support: number | null = null
    let resistance: number | null = null
    if (history.length >= 20) {
        const last20 = history.slice(-20)
        support = Math.min(...last20.map((h) => h.low))
        resistance = Math.max(...last20.map((h) => h.high))
    }

    // 量比
    const volumeRatio = computeVolumeRatio(history)

    return {
        ma20,
        rsi,
        ma50,
        ma200,
        trendPosition,
        macd,
        support,
        resistance,
        volumeRatio,
    }
}

