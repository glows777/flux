/**
 * Macro Service
 *
 * Fetches real-time macro indicators (SPY, QQQ, TNX, VIX)
 * with a 5-minute memory cache.
 * Primary: Yahoo Finance, Fallback: Finnhub.
 * Individual indicator failures are handled gracefully with placeholder values.
 */

import type { MacroTicker } from '@flux/shared'
import { CachedDataSource } from '../common/cached-source'
import { FallbackChain } from '../common/fallback-chain'
import type { FinnhubClient } from '../common/finnhub-client'
import { MemoryStore } from '../common/store-memory'
import type { Quote } from '../common/types'
import type { YahooFinanceClient } from '../common/yahoo-client'

const MACRO_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MACRO_TIMEOUT_MS = 3_000

export const VIX_DISPLAY_NAME = '恐慌指数'

const MACRO_INDICATORS = [
    { symbol: 'SPY', name: '标普500', yahooSymbol: 'SPY' },
    { symbol: 'QQQ', name: '纳斯达克100', yahooSymbol: 'QQQ' },
    { symbol: 'TNX', name: '十年美债', yahooSymbol: '^TNX' },
    { symbol: 'VIX', name: VIX_DISPLAY_NAME, yahooSymbol: '^VIX' },
] as const

/** Find VIX ticker from macro indicator array */
export function findVixFromMacro(
    indicators: ReadonlyArray<{ sym: string; val: string }>,
): { sym: string; val: string } | undefined {
    return indicators.find((m) => m.sym === VIX_DISPLAY_NAME)
}

function formatValue(symbol: string, value: number): string {
    if (symbol === 'TNX') {
        return `${value.toFixed(2)}%`
    }
    return value.toFixed(2)
}

function formatChange(change: number): string {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(1)}%`
}

export interface MacroService {
    getMacro(): Promise<MacroTicker[]>
    clearCache(): void
}

export function createMacroService(deps: {
    readonly yahoo: YahooFinanceClient
    readonly finnhub: FinnhubClient
}): MacroService {
    const chain = new FallbackChain<Quote>(
        [
            {
                name: 'yahoo',
                fetch: (s) => deps.yahoo.getQuote(s),
                timeout: MACRO_TIMEOUT_MS,
            },
            {
                name: 'finnhub',
                fetch: (s) => deps.finnhub.getQuote(s),
                timeout: MACRO_TIMEOUT_MS,
            },
        ],
        { circuitBreaker: { failureThreshold: 3, cooldownMs: 30_000 } },
    )

    const store = new MemoryStore<MacroTicker[]>()

    const cache = new CachedDataSource<MacroTicker[]>({
        store,
        fetchFn: async () => {
            const results = await Promise.allSettled(
                MACRO_INDICATORS.map(async (ind) => {
                    const quote = await chain.execute(ind.yahooSymbol)
                    return {
                        sym: ind.name,
                        val: formatValue(ind.symbol, quote.price),
                        chg: formatChange(quote.change),
                        trend: (quote.change >= 0 ? 'up' : 'down') as
                            | 'up'
                            | 'down',
                    }
                }),
            )
            return results.map((r, i) =>
                r.status === 'fulfilled'
                    ? r.value
                    : {
                          sym: MACRO_INDICATORS[i].name,
                          val: '--',
                          chg: '--',
                          trend: 'up' as const,
                      },
            )
        },
        ttl: MACRO_TTL_MS,
    })

    return {
        getMacro: () => cache.get('__macro__'),
        clearCache: () => store.clear(),
    }
}
