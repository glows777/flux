/**
 * Market data types for external API clients
 *
 * Canonical type definitions — all modules import from here.
 */

// ---------------------------------------------------------------------------
// Value objects
// ---------------------------------------------------------------------------

/**
 * Unified quote data
 */
export interface Quote {
    readonly symbol: string
    readonly price: number
    /** Change percentage */
    readonly change: number
    readonly volume?: number
    readonly timestamp: Date
}

/**
 * Historical data point (OHLCV)
 */
export interface HistoryPoint {
    readonly date: Date
    readonly open: number
    readonly high: number
    readonly low: number
    readonly close: number
    readonly volume?: number
}

/**
 * Company fundamentals
 */
export interface CompanyOverview {
    readonly symbol: string
    readonly name: string
    readonly sector?: string
    readonly pe?: number
    readonly marketCap?: number
    readonly eps?: number
    readonly dividendYield?: number
}

// ---------------------------------------------------------------------------
// Client contracts
// ---------------------------------------------------------------------------

/**
 * Market data client interface
 */
export interface MarketDataClient {
    getQuote(symbol: string): Promise<Quote>
    getDailyHistory(symbol: string, days: number): Promise<HistoryPoint[]>
    getCompanyOverview(symbol: string): Promise<CompanyOverview>
}

/**
 * Finnhub Company News API raw response
 */
export interface FinnhubNewsItem {
    readonly category: string
    /** Unix timestamp (seconds) */
    readonly datetime: number
    readonly headline: string
    readonly id: number
    readonly image: string
    /** Ticker symbol */
    readonly related: string
    readonly source: string
    readonly summary: string
    readonly url: string
}

/**
 * Finnhub API client interface (extends MarketDataClient with news)
 */
export interface FinnhubClient {
    getCompanyNews(
        symbol: string,
        from: string,
        to: string,
    ): Promise<FinnhubNewsItem[]>
}

/**
 * Extended market data client with Finnhub news capability
 */
export interface FinnhubMarketDataClient extends MarketDataClient {
    getCompanyNews(
        symbol: string,
        from: string,
        to: string,
    ): Promise<FinnhubNewsItem[]>
}

// ---------------------------------------------------------------------------
// Cache abstraction
// ---------------------------------------------------------------------------

/**
 * A timestamped wrapper for cached data
 */
export interface CacheEntry<T> {
    readonly data: T
    readonly fetchedAt: Date
}

/**
 * Generic async key-value cache store
 *
 * The optional `P` generic allows passing query parameters (e.g. date ranges)
 * through to the underlying storage layer. Services that don't need params
 * use the default (`Record<string, never>`), keeping existing call sites unchanged.
 */
export interface CacheStore<
    T,
    P extends Record<string, unknown> = Record<string, never>,
> {
    get(key: string, params?: P): Promise<CacheEntry<T> | null>
    set(key: string, data: T, params?: P): Promise<void>
}

/**
 * Query parameters for the history cache store.
 * When `days` is provided, the DB query filters by date range
 * instead of returning all rows for the symbol.
 */
export interface HistoryStoreParams extends Record<string, unknown> {
    readonly days?: number
}
