import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { CoverageStore } from '@/core/market-data/common/coverage'
import type { FinnhubClient } from '@/core/market-data/common/finnhub-client'
import type {
    CacheEntry,
    CacheStore,
    HistoryPoint,
    HistoryStoreParams,
} from '@/core/market-data/common/types'
import type { YahooFinanceClient } from '@/core/market-data/common/yahoo-client'
import {
    createHistoryService,
    getDaysForPeriod,
    type HistoryService,
    VALID_PERIODS,
} from '@/core/market-data/history/index'

function makeHistoryPoints(count: number): HistoryPoint[] {
    const base = new Date('2024-01-01')
    return Array.from({ length: count }, (_, i) => ({
        date: new Date(base.getTime() + i * 24 * 60 * 60 * 1000),
        open: 100 + i,
        high: 105 + i,
        low: 98 + i,
        close: 102 + i,
        volume: 1000 * (i + 1),
    }))
}

function createMockHistoryStore(): CacheStore<
    HistoryPoint[],
    HistoryStoreParams
> {
    const data = new Map<string, CacheEntry<HistoryPoint[]>>()
    return {
        get: mock(
            async (key: string, _params?: HistoryStoreParams) =>
                data.get(key) ?? null,
        ),
        set: mock(
            async (
                key: string,
                value: HistoryPoint[],
                _params?: HistoryStoreParams,
            ) => {
                data.set(key, { data: value, fetchedAt: new Date() })
            },
        ),
    }
}

function createMockCoverageStore(): CoverageStore {
    const coverage = new Map<string, Date>()
    return {
        getCoveredFrom: mock(async (key: string) => coverage.get(key) ?? null),
        updateCoveredFrom: mock(async (key: string, from: Date) => {
            coverage.set(key, from)
        }),
    }
}

function createMockYahoo(points?: HistoryPoint[]): YahooFinanceClient {
    return {
        getQuote: mock(async () => ({
            symbol: 'AAPL',
            price: 150,
            change: 1,
            timestamp: new Date(),
        })),
        getBatchQuotes: mock(async () => new Map()),
        getDailyHistory: mock(async () => points ?? makeHistoryPoints(10)),
        getCompanyOverview: mock(async (s: string) => ({
            symbol: s,
            name: s,
        })),
        search: mock(async () => ({ quotes: [] })),
    } as unknown as YahooFinanceClient
}

function createMockFinnhub(points?: HistoryPoint[]): FinnhubClient {
    return {
        getQuote: mock(async () => ({
            symbol: 'AAPL',
            price: 149,
            change: 0.5,
            timestamp: new Date(),
        })),
        getDailyHistory: mock(async () => points ?? makeHistoryPoints(5)),
        getCompanyOverview: mock(async (s: string) => ({
            symbol: s,
            name: s,
        })),
        getCompanyNews: mock(async () => []),
    } as unknown as FinnhubClient
}

describe('period utilities', () => {
    test('getDaysForPeriod returns correct days', () => {
        expect(getDaysForPeriod('1D')).toBe(1)
        expect(getDaysForPeriod('1W')).toBe(5)
        expect(getDaysForPeriod('1M')).toBe(22)
        expect(getDaysForPeriod('3M')).toBe(65)
        expect(getDaysForPeriod('1Y')).toBe(252)
    })

    test('getDaysForPeriod YTD returns positive number', () => {
        const days = getDaysForPeriod('YTD')
        expect(days).toBeGreaterThan(0)
    })

    test('VALID_PERIODS contains all periods', () => {
        expect(VALID_PERIODS).toEqual(['1D', '1W', '1M', '3M', 'YTD', '1Y'])
    })
})

describe('HistoryService', () => {
    let yahoo: ReturnType<typeof createMockYahoo>
    let finnhub: ReturnType<typeof createMockFinnhub>
    let historyStore: ReturnType<typeof createMockHistoryStore>
    let coverageStore: ReturnType<typeof createMockCoverageStore>
    let service: HistoryService

    beforeEach(() => {
        yahoo = createMockYahoo()
        finnhub = createMockFinnhub()
        historyStore = createMockHistoryStore()
        coverageStore = createMockCoverageStore()
        service = createHistoryService({
            yahoo,
            finnhub,
            historyStore,
            coverageStore,
        })
    })

    describe('getHistory', () => {
        test('returns formatted chart data points', async () => {
            const result = await service.getHistory('AAPL', '1W')
            expect(result.symbol).toBe('AAPL')
            expect(result.period).toBe('1W')
            expect(result.points.length).toBeGreaterThan(0)
            // Each point has a date string in YYYY-MM-DD format
            for (const p of result.points) {
                expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
                expect(typeof p.open).toBe('number')
                expect(typeof p.close).toBe('number')
            }
        })

        test('falls back to finnhub when yahoo fails', async () => {
            ;(
                yahoo.getDailyHistory as ReturnType<typeof mock>
            ).mockImplementation(async () => {
                throw new Error('Yahoo down')
            })
            const result = await service.getHistory('AAPL', '1M')
            expect(result.points.length).toBeGreaterThan(0)
            expect(finnhub.getDailyHistory).toHaveBeenCalled()
        })

        test('uses coverage store to track ranges', async () => {
            await service.getHistory('AAPL', '1M')
            expect(coverageStore.updateCoveredFrom).toHaveBeenCalled()
        })
    })

    describe('getHistoryRaw', () => {
        test('returns raw HistoryPoint array', async () => {
            const raw = await service.getHistoryRaw('AAPL', 10)
            expect(raw.length).toBeGreaterThan(0)
            expect(raw[0].date).toBeInstanceOf(Date)
            expect(typeof raw[0].close).toBe('number')
        })
    })
})
