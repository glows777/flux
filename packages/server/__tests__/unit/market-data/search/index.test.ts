import { describe, expect, mock, test, beforeEach } from 'bun:test'
import {
    createSearchService,
    MAX_RESULTS,
    L1_SUFFICIENT_COUNT,
    type SearchService,
} from '@/core/market-data/search/index'
import type { YahooFinanceClient } from '@/core/market-data/common/yahoo-client'

function createMockPrisma(
    infoRows: Array<{ symbol: string; name: string | null }> = [],
    watchlistRows: Array<{ symbol: string; name: string }> = [],
    searchQueryRows: Array<{ symbol: string; cnName: string }> = [],
) {
    return {
        stockInfo: {
            findMany: mock(async () => infoRows),
        },
        watchlist: {
            findMany: mock(async () => watchlistRows),
        },
        stockSearchQuery: {
            findMany: mock(async () => searchQueryRows),
        },
    }
}

function createMockYahoo(
    results: Array<{
        symbol?: string
        isYahooFinance?: boolean
        quoteType?: string
        longname?: string
        shortname?: string
    }> = [],
): YahooFinanceClient {
    return {
        getQuote: mock(async () => ({
            symbol: 'AAPL',
            price: 150,
            change: 1,
            timestamp: new Date(),
        })),
        getBatchQuotes: mock(async () => new Map()),
        getDailyHistory: mock(async () => []),
        getCompanyOverview: mock(async (s: string) => ({
            symbol: s,
            name: s,
        })),
        search: mock(async () => ({ quotes: results })),
    } as unknown as YahooFinanceClient
}

describe('SearchService', () => {
    test('returns empty array for empty query', async () => {
        const prisma = createMockPrisma()
        const yahoo = createMockYahoo()
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('')
        expect(results).toEqual([])
    })

    test('returns empty array for whitespace query', async () => {
        const prisma = createMockPrisma()
        const yahoo = createMockYahoo()
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('   ')
        expect(results).toEqual([])
    })

    test('returns L1 results from local DB', async () => {
        const prisma = createMockPrisma(
            [{ symbol: 'AAPL', name: 'Apple Inc' }],
            [],
            [],
        )
        const yahoo = createMockYahoo()
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('AAPL')
        expect(results.length).toBe(1)
        expect(results[0].symbol).toBe('AAPL')
        expect(results[0].name).toBe('Apple Inc')
    })

    test('watchlist takes priority over stockInfo', async () => {
        const prisma = createMockPrisma(
            [{ symbol: 'AAPL', name: 'Apple Inc (Info)' }],
            [{ symbol: 'AAPL', name: 'Apple Inc (Watchlist)' }],
            [],
        )
        const yahoo = createMockYahoo()
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('AAPL')
        expect(results[0].name).toBe('Apple Inc (Watchlist)')
    })

    test('searchQuery takes priority over stockInfo', async () => {
        const prisma = createMockPrisma(
            [{ symbol: 'AAPL', name: 'Apple Inc (Info)' }],
            [],
            [{ symbol: 'AAPL', cnName: 'Apple (Search)' }],
        )
        const yahoo = createMockYahoo()
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('AAPL')
        expect(results[0].name).toBe('Apple (Search)')
    })

    test('falls back to Yahoo L2 when L1 has fewer than L1_SUFFICIENT_COUNT results', async () => {
        const prisma = createMockPrisma(
            [{ symbol: 'AAPL', name: 'Apple Inc' }],
            [],
            [],
        )
        const yahoo = createMockYahoo([
            {
                symbol: 'MSFT',
                isYahooFinance: true,
                quoteType: 'EQUITY',
                longname: 'Microsoft Corp',
            },
        ])
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('A')
        expect(results.length).toBe(2)
        expect(results.find((r) => r.symbol === 'MSFT')).toBeTruthy()
    })

    test('skips Yahoo L2 when L1 has enough results', async () => {
        const manyResults = Array.from({ length: L1_SUFFICIENT_COUNT }, (_, i) => ({
            symbol: `SYM${i}`,
            name: `Company ${i}`,
        }))
        const prisma = createMockPrisma(manyResults, [], [])
        const yahoo = createMockYahoo()
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('SYM')
        expect(yahoo.search).not.toHaveBeenCalled()
        expect(results.length).toBe(L1_SUFFICIENT_COUNT)
    })

    test('filters Yahoo results to EQUITY only', async () => {
        const prisma = createMockPrisma()
        const yahoo = createMockYahoo([
            {
                symbol: 'AAPL',
                isYahooFinance: true,
                quoteType: 'EQUITY',
                longname: 'Apple Inc',
            },
            {
                symbol: 'BTC-USD',
                isYahooFinance: true,
                quoteType: 'CRYPTOCURRENCY',
                longname: 'Bitcoin',
            },
        ])
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('A')
        expect(results.length).toBe(1)
        expect(results[0].symbol).toBe('AAPL')
    })

    test('L1 results take priority over L2 duplicates', async () => {
        const prisma = createMockPrisma(
            [{ symbol: 'AAPL', name: 'Apple (Local)' }],
            [],
            [],
        )
        const yahoo = createMockYahoo([
            {
                symbol: 'AAPL',
                isYahooFinance: true,
                quoteType: 'EQUITY',
                longname: 'Apple Inc (Yahoo)',
            },
        ])
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('A')
        const apple = results.find((r) => r.symbol === 'AAPL')
        expect(apple?.name).toBe('Apple (Local)')
    })

    test('limits results to MAX_RESULTS', async () => {
        const manyResults = Array.from({ length: 15 }, (_, i) => ({
            symbol: `SYM${i}`,
            name: `Company ${i}`,
        }))
        const prisma = createMockPrisma(manyResults, [], [])
        const yahoo = createMockYahoo()
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('SYM')
        expect(results.length).toBeLessThanOrEqual(MAX_RESULTS)
    })

    test('handles L1 DB failure gracefully', async () => {
        const prisma = {
            stockInfo: {
                findMany: mock(async () => {
                    throw new Error('DB down')
                }),
            },
            watchlist: {
                findMany: mock(async () => {
                    throw new Error('DB down')
                }),
            },
            stockSearchQuery: {
                findMany: mock(async () => {
                    throw new Error('DB down')
                }),
            },
        }
        const yahoo = createMockYahoo([
            {
                symbol: 'AAPL',
                isYahooFinance: true,
                quoteType: 'EQUITY',
                longname: 'Apple Inc',
            },
        ])
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('A')
        expect(results.length).toBe(1)
        expect(results[0].symbol).toBe('AAPL')
    })

    test('handles Yahoo L2 failure gracefully and returns L1 results', async () => {
        const prisma = createMockPrisma(
            [{ symbol: 'AAPL', name: 'Apple Inc' }],
            [],
            [],
        )
        const yahoo = createMockYahoo()
        ;(yahoo.search as ReturnType<typeof mock>).mockImplementation(
            async () => {
                throw new Error('Yahoo search down')
            },
        )
        const service = createSearchService({ yahoo, prisma: prisma as any })
        const results = await service.search('A')
        expect(results.length).toBe(1)
        expect(results[0].symbol).toBe('AAPL')
    })
})
