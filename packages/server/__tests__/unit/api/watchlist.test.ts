/**
 * P2-07: Watchlist API Unit Tests
 *
 * Test scenarios per spec:
 * - T07-01: Empty watchlist returns empty array
 * - T07-02: Single stock returns 1 item with complete data
 * - T07-03: Multiple stocks returned in creation order
 * - T07-04: Quote data correctly mapped (price, chg)
 * - T07-05: History data correctly mapped (data array with 20 points)
 * - T07-06: Partial quote failure does not affect other items
 * - T07-07: Multiple symbols fetched concurrently
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { HistoryPoint, Quote } from '@/core/market-data'
import { CHART_DAYS, getWatchlistItems } from '@/core/api/watchlist'

// --- Mock types ---

interface MockWatchlist {
    id: string
    symbol: string
    name: string
    createdAt: Date
    updatedAt: Date
}

// --- Mock factories ---

function createMockWatchlistRow(overrides: Partial<MockWatchlist> = {}): MockWatchlist {
    return {
        id: 'cuid-wl-1',
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        ...overrides,
    }
}

function createMockQuote(symbol: string = 'NVDA', overrides: Partial<Quote> = {}): Quote {
    return {
        symbol,
        price: 780.42,
        change: 2.4,
        volume: 50000000,
        timestamp: new Date(),
        ...overrides,
    }
}

function createMockHistory(count: number = 20): HistoryPoint[] {
    return Array.from({ length: count }, (_, i) => ({
        date: new Date(Date.UTC(2024, 5, 20 - i)),
        open: 750 + i,
        high: 760 + i,
        low: 740 + i,
        close: 755 + i,
        volume: 1000000 + i * 10000,
    }))
}

// --- Mock Prisma ---

function createMockPrisma() {
    return {
        watchlist: {
            findMany: mock(() => Promise.resolve([] as MockWatchlist[])),
        },
    }
}

// --- Tests ---

describe('P2-07: Watchlist API', () => {
    let mockPrisma: ReturnType<typeof createMockPrisma>
    let mockGetQuote: ReturnType<typeof mock>
    let mockGetHistoryRaw: ReturnType<typeof mock>

    beforeEach(() => {
        mockPrisma = createMockPrisma()
        mockGetQuote = mock((symbol: string) =>
            Promise.resolve(createMockQuote(symbol)),
        )
        mockGetHistoryRaw = mock((_symbol: string, _days: number) =>
            Promise.resolve(createMockHistory(20)),
        )
    })

    function getDeps() {
        return {
            prisma: mockPrisma as never,
            getQuote: mockGetQuote as (symbol: string) => Promise<Quote>,
            getHistoryRaw: mockGetHistoryRaw as (symbol: string, days: number) => Promise<HistoryPoint[]>,
        }
    }

    // ─── T07-01: Empty watchlist ───

    describe('T07-01: Empty watchlist', () => {
        it('should return empty array when no stocks in watchlist', async () => {
            mockPrisma.watchlist.findMany = mock(() => Promise.resolve([]))

            const result = await getWatchlistItems(getDeps())

            expect(result).toEqual([])
        })

        it('should not call quote or history APIs when watchlist is empty', async () => {
            mockPrisma.watchlist.findMany = mock(() => Promise.resolve([]))

            await getWatchlistItems(getDeps())

            expect(mockGetQuote).not.toHaveBeenCalled()
            expect(mockGetHistoryRaw).not.toHaveBeenCalled()
        })
    })

    // ─── T07-02: Single stock ───

    describe('T07-02: Single stock returns complete data', () => {
        it('should return 1 item with all fields populated', async () => {
            mockPrisma.watchlist.findMany = mock(() =>
                Promise.resolve([createMockWatchlistRow()]),
            )

            const result = await getWatchlistItems(getDeps())

            expect(result).toHaveLength(1)
            const item = result[0]
            expect(item.id).toBe('NVDA')
            expect(item.name).toBe('NVIDIA Corporation')
            expect(typeof item.price).toBe('number')
            expect(typeof item.chg).toBe('number')
            expect(item.signal).toBe('')
            expect(item.score).toBe(0)
            expect(Array.isArray(item.data)).toBe(true)
        })
    })

    // ─── T07-03: Multiple stocks in order ───

    describe('T07-03: Multiple stocks returned in creation order', () => {
        it('should return multiple items ordered by createdAt', async () => {
            const watchlist = [
                createMockWatchlistRow({ id: '1', symbol: 'NVDA', name: 'NVIDIA', createdAt: new Date('2024-01-01') }),
                createMockWatchlistRow({ id: '2', symbol: 'TSLA', name: 'Tesla', createdAt: new Date('2024-01-02') }),
                createMockWatchlistRow({ id: '3', symbol: 'AMD', name: 'AMD', createdAt: new Date('2024-01-03') }),
            ]
            mockPrisma.watchlist.findMany = mock(() => Promise.resolve(watchlist))

            const result = await getWatchlistItems(getDeps())

            expect(result).toHaveLength(3)
            expect(result[0].id).toBe('NVDA')
            expect(result[1].id).toBe('TSLA')
            expect(result[2].id).toBe('AMD')
        })
    })

    // ─── T07-04: Quote data correctly mapped ───

    describe('T07-04: Quote data correctly mapped', () => {
        it('should map price and chg from quote data', async () => {
            mockPrisma.watchlist.findMany = mock(() =>
                Promise.resolve([createMockWatchlistRow()]),
            )
            mockGetQuote = mock(() =>
                Promise.resolve(createMockQuote('NVDA', { price: 780.42, change: 2.4 })),
            )

            const result = await getWatchlistItems(getDeps())

            expect(result[0].price).toBe(780.42)
            expect(result[0].chg).toBe(2.4)
        })
    })

    // ─── T07-05: History data correctly mapped ───

    describe('T07-05: History data correctly mapped', () => {
        it('should map close prices from history to data array', async () => {
            const history = createMockHistory(20)
            mockPrisma.watchlist.findMany = mock(() =>
                Promise.resolve([createMockWatchlistRow()]),
            )
            mockGetHistoryRaw = mock(() => Promise.resolve(history))

            const result = await getWatchlistItems(getDeps())

            expect(result[0].data).toHaveLength(20)
            expect(result[0].data).toEqual(history.map(h => h.close))
        })

        it('should request CHART_DAYS days of history', async () => {
            mockPrisma.watchlist.findMany = mock(() =>
                Promise.resolve([createMockWatchlistRow()]),
            )

            await getWatchlistItems(getDeps())

            expect(mockGetHistoryRaw).toHaveBeenCalledWith('NVDA', CHART_DAYS)
        })
    })

    // ─── T07-06: Partial failure handling ───

    describe('T07-06: Partial failure does not affect other items', () => {
        it('should return successful items when some quote fetches fail', async () => {
            const watchlist = [
                createMockWatchlistRow({ id: '1', symbol: 'NVDA', name: 'NVIDIA' }),
                createMockWatchlistRow({ id: '2', symbol: 'FAIL', name: 'FailCorp' }),
                createMockWatchlistRow({ id: '3', symbol: 'AMD', name: 'AMD' }),
            ]
            mockPrisma.watchlist.findMany = mock(() => Promise.resolve(watchlist))

            mockGetQuote = mock((symbol: string) => {
                if (symbol === 'FAIL') {
                    return Promise.reject(new Error('API error'))
                }
                return Promise.resolve(createMockQuote(symbol))
            })

            const result = await getWatchlistItems(getDeps())

            expect(result).toHaveLength(2)
            expect(result.find(i => i.id === 'FAIL')).toBeUndefined()
            expect(result.find(i => i.id === 'NVDA')).toBeDefined()
            expect(result.find(i => i.id === 'AMD')).toBeDefined()
        })

        it('should return successful items when some history fetches fail', async () => {
            const watchlist = [
                createMockWatchlistRow({ id: '1', symbol: 'NVDA', name: 'NVIDIA' }),
                createMockWatchlistRow({ id: '2', symbol: 'BAD', name: 'BadCorp' }),
            ]
            mockPrisma.watchlist.findMany = mock(() => Promise.resolve(watchlist))

            mockGetHistoryRaw = mock((symbol: string) => {
                if (symbol === 'BAD') {
                    return Promise.reject(new Error('History API error'))
                }
                return Promise.resolve(createMockHistory(20))
            })

            const result = await getWatchlistItems(getDeps())

            expect(result).toHaveLength(1)
            expect(result[0].id).toBe('NVDA')
        })
    })

    // ─── T07-07: Concurrent fetching ───

    describe('T07-07: Multiple symbols fetched concurrently', () => {
        it('should call quote and history APIs for all symbols', async () => {
            const watchlist = [
                createMockWatchlistRow({ id: '1', symbol: 'NVDA', name: 'NVIDIA' }),
                createMockWatchlistRow({ id: '2', symbol: 'TSLA', name: 'Tesla' }),
                createMockWatchlistRow({ id: '3', symbol: 'AMD', name: 'AMD' }),
            ]
            mockPrisma.watchlist.findMany = mock(() => Promise.resolve(watchlist))

            await getWatchlistItems(getDeps())

            expect(mockGetQuote).toHaveBeenCalledTimes(3)
            expect(mockGetHistoryRaw).toHaveBeenCalledTimes(3)
        })

        it('should query watchlist ordered by createdAt ascending', async () => {
            mockPrisma.watchlist.findMany = mock(() => Promise.resolve([]))

            await getWatchlistItems(getDeps())

            expect(mockPrisma.watchlist.findMany).toHaveBeenCalledWith({
                orderBy: { createdAt: 'asc' },
            })
        })
    })
})
