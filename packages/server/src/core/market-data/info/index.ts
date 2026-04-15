/**
 * Info Service
 *
 * Provides company fundamentals (PE, MarketCap, EPS, DividendYield)
 * with a 7-day DB cache.
 * Primary: Yahoo Finance, Fallback: Finnhub.
 */

import { CachedDataSource } from '../common/cached-source'
import { FallbackChain } from '../common/fallback-chain'
import type { FinnhubClient } from '../common/finnhub-client'
import type { CacheStore, CompanyOverview } from '../common/types'
import type { YahooFinanceClient } from '../common/yahoo-client'

const INFO_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const INFO_TIMEOUT_MS = 5_000

export interface InfoService {
    getInfo(symbol: string): Promise<CompanyOverview>
}

export function createInfoService(deps: {
    readonly yahoo: YahooFinanceClient
    readonly finnhub: FinnhubClient
    readonly infoStore: CacheStore<CompanyOverview>
}): InfoService {
    const chain = new FallbackChain<CompanyOverview>(
        [
            {
                name: 'yahoo',
                fetch: (s) => deps.yahoo.getCompanyOverview(s),
                timeout: INFO_TIMEOUT_MS,
            },
            {
                name: 'finnhub',
                fetch: (s) => deps.finnhub.getCompanyOverview(s),
                timeout: INFO_TIMEOUT_MS,
            },
        ],
        { circuitBreaker: { failureThreshold: 3, cooldownMs: 30_000 } },
    )

    const source = new CachedDataSource<CompanyOverview>({
        store: deps.infoStore,
        fetchFn: (symbol) => chain.execute(symbol),
        ttl: INFO_TTL_MS,
    })

    return {
        getInfo: (symbol) => source.get(symbol),
    }
}
