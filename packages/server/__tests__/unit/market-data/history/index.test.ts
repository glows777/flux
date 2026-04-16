import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
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

const REAL_DATE_NOW = Date.now
const FIXED_NOW = new Date('2026-04-15T00:00:00.000Z').getTime()

function makeRecentWeekdayHistoryPoints(
    count: number,
    endDate = new Date('2026-04-14T00:00:00.000Z'),
): HistoryPoint[] {
    const points: HistoryPoint[] = []
    const cursor = new Date(endDate)

    while (points.length < count) {
        const day = cursor.getUTCDay()
        if (day !== 0 && day !== 6) {
            const index = count - points.length
            points.push({
                date: new Date(cursor),
                open: 100 + index,
                high: 105 + index,
                low: 98 + index,
                close: 102 + index,
                volume: 1000 * index,
            })
        }
        cursor.setUTCDate(cursor.getUTCDate() - 1)
    }

    return points.reverse()
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

function createCalendarRangeHistoryStore(
    points: HistoryPoint[],
): CacheStore<HistoryPoint[], HistoryStoreParams> {
    return {
        get: mock(async (_key: string, params?: HistoryStoreParams) => {
            const days = Number(params?.days ?? points.length)
            const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
            return {
                data: points.filter((point) => point.date >= cutoff),
                fetchedAt: new Date(Date.now()),
            }
        }),
        set: mock(async () => undefined),
    }
}

function createFixedHistoryStore(
    points: HistoryPoint[],
    fetchedAt: Date,
): CacheStore<HistoryPoint[], HistoryStoreParams> {
    let currentData = points
    let currentFetchedAt = fetchedAt

    return {
        get: mock(async () => ({
            data: currentData,
            fetchedAt: currentFetchedAt,
        })),
        set: mock(
            async (
                _key: string,
                value: HistoryPoint[],
                _params?: HistoryStoreParams,
            ) => {
                currentData = value
                currentFetchedAt = new Date(Date.now())
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

function createCoveredHistoryStore(): CoverageStore {
    return {
        getCoveredFrom: mock(async () => new Date('2020-01-01T00:00:00.000Z')),
        updateCoveredFrom: mock(async () => undefined),
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
        Date.now = () => FIXED_NOW
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

    afterEach(() => {
        Date.now = REAL_DATE_NOW
    })

    describe('getHistory', () => {
        test('returns only the requested trading sessions on a cold-cache 1M request', async () => {
            const yearlyPoints = makeRecentWeekdayHistoryPoints(252)

            yahoo = createMockYahoo(yearlyPoints)
            finnhub = createMockFinnhub()
            historyStore = createMockHistoryStore()
            coverageStore = createMockCoverageStore()
            service = createHistoryService({
                yahoo,
                finnhub,
                historyStore,
                coverageStore,
            })

            const result = await service.getHistory('AAPL', '1M')

            expect(result.points).toHaveLength(22)
            expect(result.points[0]?.date).toBe('2026-03-16')
            expect(result.points.at(-1)?.date).toBe('2026-04-14')
        })

        test('refreshes stale cached history when the latest point is weeks behind today', async () => {
            const stalePoints = makeRecentWeekdayHistoryPoints(
                252,
                new Date('2026-03-30T00:00:00.000Z'),
            )
            const freshPoints = makeRecentWeekdayHistoryPoints(252)

            yahoo = createMockYahoo(freshPoints)
            finnhub = createMockFinnhub()
            historyStore = createFixedHistoryStore(
                stalePoints,
                new Date('2026-03-30T00:00:00.000Z'),
            )
            coverageStore = createCoveredHistoryStore()
            service = createHistoryService({
                yahoo,
                finnhub,
                historyStore,
                coverageStore,
            })

            const result = await service.getHistory('AAPL', '1M')

            expect(result.points.at(-1)?.date).toBe('2026-04-14')
            expect(yahoo.getDailyHistory).toHaveBeenCalledTimes(1)
        })

        test('returns the full 252 trading sessions for a cached 1Y request', async () => {
            const yearlyPoints = makeRecentWeekdayHistoryPoints(252)

            yahoo = createMockYahoo(yearlyPoints)
            finnhub = createMockFinnhub()
            historyStore = createCalendarRangeHistoryStore(yearlyPoints)
            coverageStore = createCoveredHistoryStore()
            service = createHistoryService({
                yahoo,
                finnhub,
                historyStore,
                coverageStore,
            })

            const result = await service.getHistory('AAPL', '1Y')

            expect(result.points).toHaveLength(252)
            expect(result.points[0]?.date).toBe('2025-04-28')
            expect(result.points.at(-1)?.date).toBe('2026-04-14')
        })

        test('returns partial cached 1Y history when refresh fails', async () => {
            const stalePartialPoints = makeRecentWeekdayHistoryPoints(
                208,
                new Date('2026-03-30T00:00:00.000Z'),
            )

            yahoo = createMockYahoo()
            finnhub = createMockFinnhub()
            ;(
                yahoo.getDailyHistory as ReturnType<typeof mock>
            ).mockImplementation(async () => {
                throw new Error('Yahoo blocked')
            })
            ;(
                finnhub.getDailyHistory as ReturnType<typeof mock>
            ).mockImplementation(async () => {
                throw new Error('Finnhub forbidden')
            })
            historyStore = createFixedHistoryStore(
                stalePartialPoints,
                new Date('2026-03-30T00:00:00.000Z'),
            )
            coverageStore = createCoveredHistoryStore()
            service = createHistoryService({
                yahoo,
                finnhub,
                historyStore,
                coverageStore,
            })

            const result = await service.getHistory('AAPL', '1Y')

            expect(result.points).toHaveLength(208)
            expect(result.points[0]?.date).toBe('2025-06-12')
            expect(result.points.at(-1)?.date).toBe('2026-03-30')
        })

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

        test('deduplicates points that fall on the same UTC day', async () => {
            const duplicateDayPoints: HistoryPoint[] = [
                {
                    date: new Date('2024-03-25T13:30:00.000Z'),
                    open: 100,
                    high: 110,
                    low: 95,
                    close: 105,
                    volume: 1000,
                },
                {
                    date: new Date('2024-03-25T20:00:00.000Z'),
                    open: 101,
                    high: 111,
                    low: 96,
                    close: 106,
                    volume: 1100,
                },
                {
                    date: new Date('2024-03-26T13:30:00.000Z'),
                    open: 102,
                    high: 112,
                    low: 97,
                    close: 107,
                    volume: 1200,
                },
            ]

            yahoo = createMockYahoo(duplicateDayPoints)
            finnhub = createMockFinnhub()
            historyStore = createMockHistoryStore()
            coverageStore = createMockCoverageStore()
            service = createHistoryService({
                yahoo,
                finnhub,
                historyStore,
                coverageStore,
            })

            const result = await service.getHistory('AAPL', '1W')

            expect(result.points).toEqual([
                {
                    date: '2024-03-25',
                    open: 101,
                    high: 111,
                    low: 96,
                    close: 106,
                    volume: 1100,
                },
                {
                    date: '2024-03-26',
                    open: 102,
                    high: 112,
                    low: 97,
                    close: 107,
                    volume: 1200,
                },
            ])
        })
    })

    describe('getHistoryRaw', () => {
        test('returns raw HistoryPoint array', async () => {
            const raw = await service.getHistoryRaw('AAPL', 10)
            expect(raw.length).toBeGreaterThan(0)
            expect(raw[0].date).toBeInstanceOf(Date)
            expect(typeof raw[0].close).toBe('number')
        })

        test('returns stale cached history when refresh fails', async () => {
            const stalePoints = makeRecentWeekdayHistoryPoints(
                20,
                new Date('2026-03-30T00:00:00.000Z'),
            )

            yahoo = createMockYahoo()
            finnhub = createMockFinnhub()
            ;(
                yahoo.getDailyHistory as ReturnType<typeof mock>
            ).mockImplementation(async () => {
                throw new Error('Yahoo blocked')
            })
            ;(
                finnhub.getDailyHistory as ReturnType<typeof mock>
            ).mockImplementation(async () => {
                throw new Error('Finnhub forbidden')
            })
            historyStore = createFixedHistoryStore(
                stalePoints,
                new Date('2026-03-30T00:00:00.000Z'),
            )
            coverageStore = createCoveredHistoryStore()
            service = createHistoryService({
                yahoo,
                finnhub,
                historyStore,
                coverageStore,
            })

            const raw = await service.getHistoryRaw('AAPL', 10)

            expect(raw).toHaveLength(20)
            expect(raw.at(-1)?.date.toISOString()).toBe(
                '2026-03-30T00:00:00.000Z',
            )
        })

        test('returns one raw point per UTC day, keeping the latest timestamp', async () => {
            const duplicateDayPoints: HistoryPoint[] = [
                {
                    date: new Date('2024-03-25T00:00:00.000Z'),
                    open: 99,
                    high: 109,
                    low: 94,
                    close: 104,
                    volume: 900,
                },
                {
                    date: new Date('2024-03-25T20:00:00.000Z'),
                    open: 101,
                    high: 111,
                    low: 96,
                    close: 106,
                    volume: 1100,
                },
            ]

            yahoo = createMockYahoo(duplicateDayPoints)
            finnhub = createMockFinnhub()
            historyStore = createMockHistoryStore()
            coverageStore = createMockCoverageStore()
            service = createHistoryService({
                yahoo,
                finnhub,
                historyStore,
                coverageStore,
            })

            const raw = await service.getHistoryRaw('AAPL', 10)

            expect(raw).toHaveLength(1)
            expect(raw[0]).toMatchObject({
                close: 106,
                volume: 1100,
            })
            expect(raw[0].date.toISOString()).toBe('2024-03-25T00:00:00.000Z')
        })
    })
})
