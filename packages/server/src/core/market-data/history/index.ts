/**
 * History Service
 *
 * Provides stock price history with cache TTL and coverage tracking.
 * Primary: Yahoo Finance, Fallback: Finnhub.
 * Uses concurrency limiting to prevent thundering herd on cold start.
 */

import { CachedDataSource } from '../common/cached-source'
import { ConcurrencyLimiter } from '../common/concurrency'
import { type CoverageStore, withCoverage } from '../common/coverage'
import { FallbackChain } from '../common/fallback-chain'
import type { FinnhubClient } from '../common/finnhub-client'
import type {
    CacheStore,
    HistoryPoint,
    HistoryStoreParams,
} from '../common/types'
import type { YahooFinanceClient } from '../common/yahoo-client'
import { dedupeHistoryPointsByUtcDay } from './daily'
import {
    filterHistoryPointsForPeriod,
    getDaysForPeriod,
    type Period,
} from './period'

export {
    filterHistoryPointsForPeriod,
    getDaysForPeriod,
    type Period,
    VALID_PERIODS,
} from './period'

const HISTORY_TIMEOUT_MS = 5_000
const RECENT_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
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
    getHistory(
        symbol: string,
        period: Period | string,
    ): Promise<StockHistoryResult>
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
        fetchFn: async (symbol) =>
            dedupeHistoryPointsByUtcDay(await chain.execute(symbol)),
        ttl: RECENT_TTL_MS,
        staleFallback: true,
    })

    const covered = withCoverage(source, deps.coverageStore)

    return {
        async getHistory(symbol, period) {
            const normalizedPeriod = period as Period
            const days = getDaysForPeriod(normalizedPeriod)
            const now = new Date(Date.now())
            let raw = filterHistoryPointsForPeriod(
                dedupeHistoryPointsByUtcDay(
                    await covered.get(symbol, {
                        days,
                        period: normalizedPeriod,
                    }),
                ),
                normalizedPeriod,
                now,
            )

            if (normalizedPeriod !== 'YTD' && raw.length < days) {
                raw = filterHistoryPointsForPeriod(
                    dedupeHistoryPointsByUtcDay(
                        await source.forceFetch(symbol),
                    ),
                    normalizedPeriod,
                    now,
                )
            }

            return {
                symbol,
                period: normalizedPeriod,
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
            return dedupeHistoryPointsByUtcDay(
                await covered.get(symbol, { days }),
            )
        },
    }
}
