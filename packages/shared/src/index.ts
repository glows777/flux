// @flux/shared — types, schemas, constants, utilities

export type { Period } from './constants'
// ─── Constants ───
export { VALID_PERIODS } from './constants'
// ─── Schemas ───
export { periodSchema, SYMBOL_PATTERN, symbolSchema } from './schemas/stock'
// ─── API Types ───
export type { DashboardData } from './types/api'
// ─── Domain Types ───
export type {
    HoldingItem,
    MacroTicker,
    NewsItem,
    PortfolioData,
    PortfolioSummary,
    StockMetrics,
    WatchlistItem,
    WatchlistItemWithChart,
} from './types/domain'

// ─── Utilities ───
export {
    formatCurrency,
    formatDividendYield,
    formatEPS,
    formatLargeNumber,
    formatMarketCap,
    formatPE,
    formatPercent,
    formatRelativeTime,
    formatSignedCurrency,
    getGreeting,
    getVixLabel,
} from './utils/format'
