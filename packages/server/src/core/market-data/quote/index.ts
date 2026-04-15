/**
 * Quote Service
 *
 * Provides real-time stock quotes with 30s memory cache.
 * Primary: Yahoo Finance, Fallback: Finnhub.
 * Batch quotes attempt Yahoo batch first, then fall back to individual fetches.
 */

import { CachedDataSource } from '../common/cached-source'
import { FallbackChain } from '../common/fallback-chain'
import type { FinnhubClient } from '../common/finnhub-client'
import { MemoryStore } from '../common/store-memory'
import type { Quote } from '../common/types'
import type { YahooFinanceClient } from '../common/yahoo-client'

const QUOTE_TTL_MS = 30_000 // 30 seconds
const QUOTE_TIMEOUT_MS = 3_000

export interface QuoteService {
    getQuote(symbol: string): Promise<Quote>
    getBatchQuotes(symbols: string[]): Promise<Map<string, Quote>>
    clearCache(): void
}

export function createQuoteService(deps: {
    readonly yahoo: YahooFinanceClient
    readonly finnhub: FinnhubClient
}): QuoteService {
    const chain = new FallbackChain<Quote>(
        [
            {
                name: 'yahoo',
                fetch: (s) => deps.yahoo.getQuote(s),
                timeout: QUOTE_TIMEOUT_MS,
            },
            {
                name: 'finnhub',
                fetch: (s) => deps.finnhub.getQuote(s),
                timeout: QUOTE_TIMEOUT_MS,
            },
        ],
        { circuitBreaker: { failureThreshold: 3, cooldownMs: 30_000 } },
    )

    const store = new MemoryStore<Quote>()

    const source = new CachedDataSource<Quote>({
        store,
        fetchFn: (symbol) => chain.execute(symbol),
        ttl: QUOTE_TTL_MS,
    })

    return {
        getQuote: (symbol) => source.get(symbol),
        clearCache: () => store.clear(),

        async getBatchQuotes(symbols) {
            try {
                return await deps.yahoo.getBatchQuotes(symbols)
            } catch {
                const entries = await Promise.allSettled(
                    symbols.map(async (s) => [s, await source.get(s)] as const),
                )
                const map = new Map<string, Quote>()
                for (const entry of entries) {
                    if (entry.status === 'fulfilled') {
                        map.set(entry.value[0], entry.value[1])
                    }
                }
                return map
            }
        },
    }
}
