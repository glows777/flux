/**
 * P2-08: Add to Watchlist Unit Tests
 *
 * Test scenarios per spec:
 * - T08-01: Valid symbol add → returns WatchlistItemWithChart
 * - T08-02: Invalid symbol format → throws INVALID_INPUT error
 * - T08-03: Symbol already exists → throws DUPLICATE error
 * - T08-04: Symbol not found in market API → throws SYMBOL_NOT_FOUND error
 * - T08-05: Auto uppercase ('aapl' → 'AAPL')
 * - T08-06: Auto fetch company name when not provided
 * - T08-07: Use provided name instead of fetching
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { CompanyOverview, HistoryPoint, Quote } from '@/core/market-data'
import {
    AddWatchlistError,
    addToWatchlist,
    CHART_DAYS,
    type AddWatchlistDeps,
} from '@/core/api/watchlist'

// --- Mock types ---

interface MockWatchlist {
    id: string
    symbol: string
    name: string
    createdAt: Date
    updatedAt: Date
}

// --- Mock factories ---

function createMockQuote(symbol: string = 'AAPL', overrides: Partial<Quote> = {}): Quote {
    return {
        symbol,
        price: 150.0,
        change: 1.5,
        volume: 80000000,
        timestamp: new Date(),
        ...overrides,
    }
}

function createMockHistory(count: number = 20): HistoryPoint[] {
    return Array.from({ length: count }, (_, i) => ({
        date: new Date(Date.UTC(2024, 5, 20 - i)),
        open: 145 + i,
        high: 155 + i,
        low: 140 + i,
        close: 150 + i,
        volume: 1000000 + i * 10000,
    }))
}

function createMockCompanyOverview(
    symbol: string = 'AAPL',
    overrides: Partial<CompanyOverview> = {},
): CompanyOverview {
    return {
        symbol,
        name: 'Apple Inc.',
        sector: 'Technology',
        pe: 28.5,
        marketCap: 2500000000000,
        eps: 6.5,
        dividendYield: 0.55,
        ...overrides,
    }
}

function createMockWatchlistRow(overrides: Partial<MockWatchlist> = {}): MockWatchlist {
    return {
        id: 'cuid-wl-new',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        createdAt: new Date('2024-06-01'),
        updatedAt: new Date('2024-06-01'),
        ...overrides,
    }
}

// --- Mock Prisma ---

function createMockPrisma() {
    return {
        watchlist: {
            findUnique: mock(() => Promise.resolve(null)),
            create: mock(() => Promise.resolve(createMockWatchlistRow())),
        },
    }
}

// --- Tests ---

describe('P2-08: Add to Watchlist', () => {
    let mockPrisma: ReturnType<typeof createMockPrisma>
    let mockGetQuote: ReturnType<typeof mock>
    let mockGetHistoryRaw: ReturnType<typeof mock>
    let mockGetInfo: ReturnType<typeof mock>

    beforeEach(() => {
        mockPrisma = createMockPrisma()
        mockGetQuote = mock((symbol: string) =>
            Promise.resolve(createMockQuote(symbol)),
        )
        mockGetHistoryRaw = mock((_symbol: string, _days: number) =>
            Promise.resolve(createMockHistory(20)),
        )
        mockGetInfo = mock((symbol: string) =>
            Promise.resolve(createMockCompanyOverview(symbol)),
        )
    })

    function getDeps(): AddWatchlistDeps {
        return {
            prisma: mockPrisma as never,
            getQuote: mockGetQuote as (symbol: string) => Promise<Quote>,
            getHistoryRaw: mockGetHistoryRaw as (symbol: string, days: number) => Promise<HistoryPoint[]>,
            getInfo: mockGetInfo as (symbol: string) => Promise<CompanyOverview>,
        }
    }

    // ─── T08-01: Valid symbol add ───

    describe('T08-01: Valid symbol add', () => {
        it('should return a WatchlistItemWithChart on success', async () => {
            const result = await addToWatchlist({ symbol: 'AAPL' }, getDeps())

            expect(result).toEqual({
                id: 'AAPL',
                name: 'Apple Inc.',
                price: 150.0,
                chg: 1.5,
                signal: '',
                score: 0,
                data: createMockHistory(20).map(h => h.close),
            })
        })

        it('should create a watchlist record in the database', async () => {
            await addToWatchlist({ symbol: 'AAPL' }, getDeps())

            expect(mockPrisma.watchlist.create).toHaveBeenCalledTimes(1)
        })

        it('should check for duplicate before creating', async () => {
            await addToWatchlist({ symbol: 'AAPL' }, getDeps())

            expect(mockPrisma.watchlist.findUnique).toHaveBeenCalledWith({
                where: { symbol: 'AAPL' },
            })
        })

        it('should validate symbol via getQuoteWithCache', async () => {
            await addToWatchlist({ symbol: 'AAPL' }, getDeps())

            expect(mockGetQuote).toHaveBeenCalledWith('AAPL')
        })

        it('should reuse quote from validation and fetch history', async () => {
            await addToWatchlist({ symbol: 'AAPL' }, getDeps())

            expect(mockGetQuote).toHaveBeenCalledTimes(1)
            expect(mockGetHistoryRaw).toHaveBeenCalledWith('AAPL', CHART_DAYS)
        })
    })

    // ─── T08-02: Invalid symbol format ───

    describe('T08-02: Invalid symbol format', () => {
        it('should throw INVALID_INPUT for empty symbol', async () => {
            try {
                await addToWatchlist({ symbol: '' }, getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(AddWatchlistError)
                expect((error as AddWatchlistError).code).toBe('INVALID_INPUT')
            }
        })

        it('should throw INVALID_INPUT for symbol longer than 10 chars', async () => {
            try {
                await addToWatchlist({ symbol: 'ABCDEFGHIJK' }, getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(AddWatchlistError)
                expect((error as AddWatchlistError).code).toBe('INVALID_INPUT')
            }
        })

        it('should throw INVALID_INPUT for symbol with special characters', async () => {
            try {
                await addToWatchlist({ symbol: '<script>' }, getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(AddWatchlistError)
                expect((error as AddWatchlistError).code).toBe('INVALID_INPUT')
            }
        })

        it('should allow symbols with dots (e.g. BRK.B)', async () => {
            const result = await addToWatchlist({ symbol: 'BRK.B' }, getDeps())

            expect(result.id).toBe('BRK.B')
        })
    })

    // ─── T08-03: Symbol already exists ───

    describe('T08-03: Symbol already exists', () => {
        it('should throw DUPLICATE when symbol is already in watchlist', async () => {
            mockPrisma.watchlist.findUnique = mock(() =>
                Promise.resolve(createMockWatchlistRow({ symbol: 'AAPL' })),
            )

            try {
                await addToWatchlist({ symbol: 'AAPL' }, getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(AddWatchlistError)
                expect((error as AddWatchlistError).code).toBe('DUPLICATE')
            }
        })

        it('should not call market data APIs when duplicate detected', async () => {
            mockPrisma.watchlist.findUnique = mock(() =>
                Promise.resolve(createMockWatchlistRow({ symbol: 'AAPL' })),
            )

            try {
                await addToWatchlist({ symbol: 'AAPL' }, getDeps())
            } catch {
                // expected
            }

            expect(mockGetQuote).not.toHaveBeenCalled()
            expect(mockGetInfo).not.toHaveBeenCalled()
        })
    })

    // ─── T08-04: Symbol not found in market API ───

    describe('T08-04: Symbol not found in market API', () => {
        it('should throw SYMBOL_NOT_FOUND when getQuoteWithCache fails', async () => {
            mockGetQuote = mock(() =>
                Promise.reject(new Error('Symbol not found')),
            )

            try {
                await addToWatchlist({ symbol: 'ZZZZZ' }, getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(AddWatchlistError)
                expect((error as AddWatchlistError).code).toBe('SYMBOL_NOT_FOUND')
            }
        })

        it('should not create a watchlist record when symbol is invalid', async () => {
            mockGetQuote = mock(() =>
                Promise.reject(new Error('Symbol not found')),
            )

            try {
                await addToWatchlist({ symbol: 'ZZZZZ' }, getDeps())
            } catch {
                // expected
            }

            expect(mockPrisma.watchlist.create).not.toHaveBeenCalled()
        })
    })

    // ─── T08-05: Auto uppercase ───

    describe('T08-05: Auto uppercase', () => {
        it('should convert lowercase symbol to uppercase', async () => {
            await addToWatchlist({ symbol: 'aapl' }, getDeps())

            expect(mockPrisma.watchlist.findUnique).toHaveBeenCalledWith({
                where: { symbol: 'AAPL' },
            })
            expect(mockPrisma.watchlist.create).toHaveBeenCalledWith({
                data: { symbol: 'AAPL', name: 'Apple Inc.' },
            })
        })

        it('should convert mixed case symbol to uppercase', async () => {
            await addToWatchlist({ symbol: 'AaPl' }, getDeps())

            expect(mockGetQuote).toHaveBeenCalledWith('AAPL')
        })

        it('should return uppercase symbol in result', async () => {
            const result = await addToWatchlist({ symbol: 'aapl' }, getDeps())

            expect(result.id).toBe('AAPL')
        })
    })

    // ─── T08-06: Auto fetch company name ───

    describe('T08-06: Auto fetch company name when not provided', () => {
        it('should call getInfoWithCache to fetch company name', async () => {
            await addToWatchlist({ symbol: 'AAPL' }, getDeps())

            expect(mockGetInfo).toHaveBeenCalledWith('AAPL')
        })

        it('should use fetched name in created record', async () => {
            mockGetInfo = mock(() =>
                Promise.resolve(createMockCompanyOverview('AAPL', { name: 'Apple Inc.' })),
            )

            await addToWatchlist({ symbol: 'AAPL' }, getDeps())

            expect(mockPrisma.watchlist.create).toHaveBeenCalledWith({
                data: { symbol: 'AAPL', name: 'Apple Inc.' },
            })
        })

        it('should fall back to symbol when company info fetch fails', async () => {
            mockGetInfo = mock(() =>
                Promise.reject(new Error('Info not available')),
            )

            await addToWatchlist({ symbol: 'AAPL' }, getDeps())

            expect(mockPrisma.watchlist.create).toHaveBeenCalledWith({
                data: { symbol: 'AAPL', name: 'AAPL' },
            })
        })
    })

    // ─── T08-07: Use provided name ───

    describe('T08-07: Use provided name', () => {
        it('should use the provided name instead of fetching', async () => {
            await addToWatchlist({ symbol: 'AAPL', name: 'Custom Name' }, getDeps())

            expect(mockPrisma.watchlist.create).toHaveBeenCalledWith({
                data: { symbol: 'AAPL', name: 'Custom Name' },
            })
        })

        it('should not call getInfoWithCache when name is provided', async () => {
            await addToWatchlist({ symbol: 'AAPL', name: 'Custom Name' }, getDeps())

            expect(mockGetInfo).not.toHaveBeenCalled()
        })
    })

    // ─── TOCTOU: Race condition on unique constraint ───

    describe('TOCTOU: Race condition handling', () => {
        it('should throw DUPLICATE when Prisma create fails with P2002', async () => {
            const prismaError = Object.assign(new Error('Unique constraint failed'), {
                code: 'P2002',
            })
            mockPrisma.watchlist.create = mock(() => Promise.reject(prismaError))

            try {
                await addToWatchlist({ symbol: 'AAPL' }, getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(AddWatchlistError)
                expect((error as AddWatchlistError).code).toBe('DUPLICATE')
            }
        })

        it('should re-throw non-unique-constraint create errors', async () => {
            mockPrisma.watchlist.create = mock(() =>
                Promise.reject(new Error('Connection lost')),
            )

            try {
                await addToWatchlist({ symbol: 'AAPL' }, getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).not.toBeInstanceOf(AddWatchlistError)
                expect((error as Error).message).toBe('Connection lost')
            }
        })
    })
})
