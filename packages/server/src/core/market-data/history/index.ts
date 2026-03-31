/**
 * History Service
 *
 * Provides stock price history with tiered caching and coverage tracking.
 * Primary: Yahoo Finance, Fallback: Finnhub.
 * Uses concurrency limiting to prevent thundering herd on cold start.
 */

import type { CacheStore, HistoryPoint, HistoryStoreParams } from '../common/types'
import type { YahooFinanceClient } from '../common/yahoo-client'
import type { FinnhubClient } from '../common/finnhub-client'
import { CachedDataSource } from '../common/cached-source'
import { FallbackChain } from '../common/fallback-chain'
import { withCoverage, type CoverageStore } from '../common/coverage'
import { ConcurrencyLimiter } from '../common/concurrency'
import { getDaysForPeriod, type Period } from './period'

export { getDaysForPeriod, VALID_PERIODS, type Period } from './period'

const HISTORY_TIMEOUT_MS = 5_000
const RECENT_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const RECENT_WINDOW_DAYS = 5
const MAX_CONCURRENT_FETCHES = 3

export interface ChartDataPoint {
    readonly date: string
    readonly open: number
    readonly high: number
    readonly low: number
    readonly close: number
    readonly volume?: number
}

export interface StockHistoryResult {
    readonly symbol: string
    readonly period: string
    readonly points: readonly ChartDataPoint[]
}

export interface HistoryService {
    getHistory(symbol: string, period: Period | string): Promise<StockHistoryResult>
    getHistoryRaw(symbol: string, days: number): Promise<HistoryPoint[]>
}

export function createHistoryService(deps: {
    readonly yahoo: YahooFinanceClient
    readonly finnhub: FinnhubClient
    readonly historyStore: CacheStore<HistoryPoint[], HistoryStoreParams>
    readonly coverageStore: CoverageStore
}): HistoryService {
    const limiter = new ConcurrencyLimiter(MAX_CONCURRENT_FETCHES)

    const chain = new FallbackChain<HistoryPoint[]>(
        [
            {
                name: 'yahoo',
                fetch: (s) =>
                    limiter.run(() => deps.yahoo.getDailyHistory(s, 252)),
                timeout: HISTORY_TIMEOUT_MS,
            },
            {
                name: 'finnhub',
                fetch: (s) =>
                    limiter.run(() => deps.finnhub.getDailyHistory(s, 252)),
                timeout: HISTORY_TIMEOUT_MS,
            },
        ],
        { circuitBreaker: { failureThreshold: 3, cooldownMs: 30_000 } },
    )

    const source = new CachedDataSource<HistoryPoint[], HistoryStoreParams>({
        store: deps.historyStore,
        fetchFn: (symbol) => chain.execute(symbol),
        ttl: RECENT_TTL_MS,
        strategy: 'tiered',
        tieredOptions: {
            recentWindowDays: RECENT_WINDOW_DAYS,
            recentTtl: RECENT_TTL_MS,
        },
    })

    const covered = withCoverage(source, deps.coverageStore)

    return {
        async getHistory(symbol, period) {
            const days = getDaysForPeriod(period as Period)
            const raw = await covered.get(symbol, { days })
            return {
                symbol,
                period,
                points: raw.map((p) => ({
                    date: p.date.toISOString().slice(0, 10),
                    open: p.open,
                    high: p.high,
                    low: p.low,
                    close: p.close,
                    volume: p.volume,
                })),
            }
        },

        async getHistoryRaw(symbol, days) {
            return covered.get(symbol, { days })
        },
    }
}
