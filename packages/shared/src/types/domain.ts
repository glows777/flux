/**
 * Domain types for @flux/shared
 * Extracted from lib/types.ts — standalone interfaces (no Prisma imports)
 */

/**
 * 宏观指标数据
 */
export interface MacroTicker {
    sym: string
    val: string
    chg: string
    trend: 'up' | 'down'
}

/**
 * 自选股列表项
 */
export interface WatchlistItem {
    id: string
    name: string
    price: number
    chg: number
    signal?: string
    score?: number
    data: number[]
}

/**
 * API 返回的自选股项 (扩展版，含迷你图表数据)
 * 当前与 WatchlistItem 结构相同，后续可扩展
 */
export type WatchlistItemWithChart = WatchlistItem

/**
 * 新闻数据项
 */
export interface NewsItem {
    id: number | string
    source: string
    time: string
    title: string
    sentiment: 'positive' | 'negative' | 'neutral'
    url?: string
    summary?: string
}

/**
 * 单只持仓项 (含实时计算结果)
 */
export interface HoldingItem {
    readonly symbol: string
    readonly name: string | null
    readonly shares: number
    readonly avgCost: number
    readonly currentPrice: number
    readonly dailyChange: number       // 当日涨跌 %
    readonly totalPnL: number          // 总盈亏 = shares × (currentPrice - avgCost)
    readonly dailyPnL: number          // 当日盈亏
}

/**
 * 资产组合概览 (替换旧版 PortfolioSummary)
 */
export interface PortfolioSummary {
    readonly totalValue: number         // Σ(shares × currentPrice)
    readonly totalCost: number          // Σ(shares × avgCost)
    readonly totalPnL: number           // totalValue - totalCost
    readonly totalPnLPercent: number    // (totalPnL / totalCost) × 100
    readonly todayPnL: number           // Σ(每只的 dailyPnL)
    readonly todayPnLPercent: number    // todayPnL / 昨日总资产 × 100
    readonly topContributor: {
        readonly symbol: string
        readonly name: string | null
        readonly dailyPnL: number
    } | null
    readonly vix: number
}

/**
 * 完整 Portfolio 数据
 */
export interface PortfolioData {
    readonly holdings: readonly HoldingItem[]
    readonly summary: PortfolioSummary
}

/**
 * 财务指标数据 (P2-11)
 */
export interface StockMetrics {
    symbol: string
    name: string
    sector?: string
    pe?: number
    marketCap?: number
    eps?: number
    dividendYield?: number
    fetchedAt: string
}
