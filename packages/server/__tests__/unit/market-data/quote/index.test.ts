import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { FinnhubClient } from '@/core/market-data/common/finnhub-client'
import type { Quote } from '@/core/market-data/common/types'
import type { YahooFinanceClient } from '@/core/market-data/common/yahoo-client'
import {
    createQuoteService,
    type QuoteService,
} from '@/core/market-data/quote/index'

function makeQuote(symbol: string, price = 150): Quote {
    return { symbol, price, change: 1.5, volume: 1000, timestamp: new Date() }
}

function createMockYahoo(): YahooFinanceClient {
    return {
        getQuote: mock(async (s: string) => makeQuote(s)),
        getBatchQuotes: mock(async (symbols: string[]) => {
            const map = new Map<string, Quote>()
            for (const s of symbols) map.set(s, makeQuote(s))
            return map
        }),
        getDailyHistory: mock(async () => []),
        getCompanyOverview: mock(async (s: string) => ({
            symbol: s,
            name: s,
        })),
        search: mock(async () => ({ quotes: [] })),
    } as unknown as YahooFinanceClient
}

function createMockFinnhub(): FinnhubClient {
    return {
        getQuote: mock(async (s: string) => makeQuote(s, 149)),
        getDailyHistory: mock(async () => []),
        getCompanyOverview: mock(async (s: string) => ({
            symbol: s,
            name: s,
        })),
        getCompanyNews: mock(async () => []),
    } as unknown as FinnhubClient
}

describe('QuoteService', () => {
    let yahoo: ReturnType<typeof createMockYahoo>
    let finnhub: ReturnType<typeof createMockFinnhub>
    let service: QuoteService

    beforeEach(() => {
        yahoo = createMockYahoo()
        finnhub = createMockFinnhub()
        service = createQuoteService({ yahoo, finnhub })
    })

    describe('getQuote', () => {
        test('returns quote from yahoo (primary)', async () => {
            const quote = await service.getQuote('AAPL')
            expect(quote.symbol).toBe('AAPL')
            expect(quote.price).toBe(150)
            expect(yahoo.getQuote).toHaveBeenCalledTimes(1)
        })

        test('falls back to finnhub when yahoo fails', async () => {
            ;(yahoo.getQuote as ReturnType<typeof mock>).mockImplementation(
                async () => {
                    throw new Error('Yahoo down')
                },
            )
            const quote = await service.getQuote('AAPL')
            expect(quote.symbol).toBe('AAPL')
            expect(quote.price).toBe(149)
            expect(finnhub.getQuote).toHaveBeenCalledTimes(1)
        })

        test('caches quote within TTL (30s)', async () => {
            await service.getQuote('AAPL')
            await service.getQuote('AAPL')
            // Only one fetch through the chain (yahoo called once)
            expect(yahoo.getQuote).toHaveBeenCalledTimes(1)
        })

        test('throws when all providers fail', async () => {
            ;(yahoo.getQuote as ReturnType<typeof mock>).mockImplementation(
                async () => {
                    throw new Error('Yahoo down')
                },
            )
            ;(finnhub.getQuote as ReturnType<typeof mock>).mockImplementation(
                async () => {
                    throw new Error('Finnhub down')
                },
            )
            await expect(service.getQuote('AAPL')).rejects.toThrow()
        })
    })

    describe('getBatchQuotes', () => {
        test('returns batch quotes from yahoo', async () => {
            const result = await service.getBatchQuotes(['AAPL', 'MSFT'])
            expect(result.size).toBe(2)
            expect(result.get('AAPL')?.symbol).toBe('AAPL')
            expect(result.get('MSFT')?.symbol).toBe('MSFT')
            expect(yahoo.getBatchQuotes).toHaveBeenCalledTimes(1)
        })

        test('falls back to individual fetches when batch fails', async () => {
            ;(
                yahoo.getBatchQuotes as ReturnType<typeof mock>
            ).mockImplementation(async () => {
                throw new Error('Batch failed')
            })
            const result = await service.getBatchQuotes(['AAPL', 'MSFT'])
            expect(result.size).toBe(2)
            // Individual fetches go through the FallbackChain (yahoo.getQuote)
            expect(yahoo.getQuote).toHaveBeenCalledTimes(2)
        })

        test('partial results when some individual fetches fail', async () => {
            ;(
                yahoo.getBatchQuotes as ReturnType<typeof mock>
            ).mockImplementation(async () => {
                throw new Error('Batch failed')
            })
            let callCount = 0
            ;(yahoo.getQuote as ReturnType<typeof mock>).mockImplementation(
                async (s: string) => {
                    callCount++
                    if (callCount === 1) throw new Error('AAPL failed')
                    return makeQuote(s)
                },
            )
            // Also make finnhub fail for the first symbol
            let finnhubCount = 0
            ;(finnhub.getQuote as ReturnType<typeof mock>).mockImplementation(
                async (s: string) => {
                    finnhubCount++
                    if (finnhubCount === 1)
                        throw new Error('Finnhub AAPL failed too')
                    return makeQuote(s, 149)
                },
            )
            const result = await service.getBatchQuotes(['AAPL', 'MSFT'])
            // AAPL failed both providers, MSFT succeeded
            expect(result.size).toBe(1)
            expect(result.has('MSFT')).toBe(true)
        })
    })
})
