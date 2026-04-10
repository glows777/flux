// @flux/shared — types, schemas, constants, utilities

// ─── Domain Types ───
export type {
    MacroTicker,
    WatchlistItem,
    WatchlistItemWithChart,
    NewsItem,
    HoldingItem,
    PortfolioSummary,
    PortfolioData,
    StockMetrics,
} from './types/domain'

// ─── API Types ───
export type { DashboardData } from './types/api'

// ─── Constants ───
export { VALID_PERIODS } from './constants'
export type { Period } from './constants'

// ─── Schemas ───
export { SYMBOL_PATTERN, symbolSchema, periodSchema } from './schemas/stock'

// ─── Utilities ───
export {
    formatCurrency,
    formatSignedCurrency,
    formatPercent,
    formatMarketCap,
    formatPE,
    formatEPS,
    formatDividendYield,
    formatLargeNumber,
    getVixLabel,
    getGreeting,
    formatRelativeTime,
} from './utils/format'
