import { describe, expect, mock, test, beforeEach } from 'bun:test'
import { createInfoService, type InfoService } from '@/core/market-data/info/index'
import type {
    CompanyOverview,
    CacheStore,
    CacheEntry,
} from '@/core/market-data/common/types'
import type { YahooFinanceClient } from '@/core/market-data/common/yahoo-client'
import type { FinnhubClient } from '@/core/market-data/common/finnhub-client'

function makeOverview(symbol: string): CompanyOverview {
    return {
        symbol,
        name: `${symbol} Inc`,
        sector: 'Technology',
        pe: 25.5,
        marketCap: 3_000_000_000_000,
        eps: 6.12,
        dividendYield: 0.005,
    }
}

function createMockInfoStore(): CacheStore<CompanyOverview> {
    const data = new Map<string, CacheEntry<CompanyOverview>>()
    return {
        get: mock(async (key: string) => data.get(key) ?? null),
        set: mock(async (key: string, value: CompanyOverview) => {
            data.set(key, { data: value, fetchedAt: new Date() })
        }),
    }
}

function createMockYahoo(): YahooFinanceClient {
    return {
        getQuote: mock(async () => ({
            symbol: 'AAPL',
            price: 150,
            change: 1,
            timestamp: new Date(),
        })),
        getBatchQuotes: mock(async () => new Map()),
        getDailyHistory: mock(async () => []),
        getCompanyOverview: mock(async (s: string) => makeOverview(s)),
        search: mock(async () => ({ quotes: [] })),
    } as unknown as YahooFinanceClient
}

function createMockFinnhub(): FinnhubClient {
    return {
        getQuote: mock(async () => ({
            symbol: 'AAPL',
            price: 149,
            change: 0.5,
            timestamp: new Date(),
        })),
        getDailyHistory: mock(async () => []),
        getCompanyOverview: mock(
            async (s: string) =>
                ({
                    ...makeOverview(s),
                    name: `${s} Corp (Finnhub)`,
                }) as CompanyOverview,
        ),
        getCompanyNews: mock(async () => []),
    } as unknown as FinnhubClient
}

describe('InfoService', () => {
    let yahoo: ReturnType<typeof createMockYahoo>
    let finnhub: ReturnType<typeof createMockFinnhub>
    let infoStore: ReturnType<typeof createMockInfoStore>
    let service: InfoService

    beforeEach(() => {
        yahoo = createMockYahoo()
        finnhub = createMockFinnhub()
        infoStore = createMockInfoStore()
        service = createInfoService({ yahoo, finnhub, infoStore })
    })

    test('returns company info from yahoo (primary)', async () => {
        const info = await service.getInfo('AAPL')
        expect(info.symbol).toBe('AAPL')
        expect(info.name).toBe('AAPL Inc')
        expect(info.pe).toBe(25.5)
        expect(yahoo.getCompanyOverview).toHaveBeenCalledTimes(1)
    })

    test('falls back to finnhub when yahoo fails', async () => {
        ;(
            yahoo.getCompanyOverview as ReturnType<typeof mock>
        ).mockImplementation(async () => {
            throw new Error('Yahoo down')
        })
        const info = await service.getInfo('AAPL')
        expect(info.name).toBe('AAPL Corp (Finnhub)')
        expect(finnhub.getCompanyOverview).toHaveBeenCalledTimes(1)
    })

    test('caches info within TTL (7 days)', async () => {
        await service.getInfo('AAPL')
        await service.getInfo('AAPL')
        // Only one fetch through the chain
        expect(yahoo.getCompanyOverview).toHaveBeenCalledTimes(1)
    })

    test('throws when all providers fail', async () => {
        ;(
            yahoo.getCompanyOverview as ReturnType<typeof mock>
        ).mockImplementation(async () => {
            throw new Error('Yahoo down')
        })
        ;(
            finnhub.getCompanyOverview as ReturnType<typeof mock>
        ).mockImplementation(async () => {
            throw new Error('Finnhub down')
        })
        await expect(service.getInfo('AAPL')).rejects.toThrow()
    })

    test('stores fetched data in the info store', async () => {
        await service.getInfo('MSFT')
        expect(infoStore.set).toHaveBeenCalledTimes(1)
    })
})
