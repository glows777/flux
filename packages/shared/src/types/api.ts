import type { PortfolioData, WatchlistItemWithChart } from './domain'

export interface DashboardData {
    readonly portfolio: PortfolioData | null
    readonly watchlist: readonly WatchlistItemWithChart[] | null
    readonly positionSymbols: readonly string[]
}
