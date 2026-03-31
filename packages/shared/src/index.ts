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

// ─── Brief / AI Types + Schemas ───
export type {
    MorningBrief,
    MacroBrief,
    SpotlightItem,
    CatalystItem,
    BriefResponse,
    PortfolioContext,
} from './types/brief'
export {
    MacroSchema,
    SpotlightSchema,
    CatalystSchema,
    MorningBriefSchema,
} from './types/brief'

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
    formatBriefTime,
    getGreeting,
    formatRelativeTime,
} from './utils/format'
