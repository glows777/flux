/**
 * P2-09: Remove from Watchlist Unit Tests
 *
 * Test scenarios per spec:
 * - T09-01: Delete existing symbol → returns void (success)
 * - T09-02: Delete non-existent symbol → throws NOT_FOUND
 * - T09-03: Invalid symbol format → throws INVALID_INPUT
 * - T09-04: Case-insensitive ('aapl' → deletes 'AAPL')
 * - T09-05: Database record is actually removed (delete called)
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
    type RemoveWatchlistDeps,
    RemoveWatchlistError,
    removeFromWatchlist,
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

function createMockWatchlistRow(
    overrides: Partial<MockWatchlist> = {},
): MockWatchlist {
    return {
        id: 'cuid-wl-1',
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
            findUnique: mock(() => Promise.resolve(createMockWatchlistRow())),
            delete: mock(() => Promise.resolve(createMockWatchlistRow())),
        },
    }
}

// --- Tests ---

describe('P2-09: Remove from Watchlist', () => {
    let mockPrisma: ReturnType<typeof createMockPrisma>

    beforeEach(() => {
        mockPrisma = createMockPrisma()
    })

    function getDeps(): RemoveWatchlistDeps {
        return {
            prisma: mockPrisma as never,
        }
    }

    // ─── T09-01: Delete existing symbol ───

    describe('T09-01: Delete existing symbol', () => {
        it('should resolve without throwing on success', async () => {
            await expect(
                removeFromWatchlist('AAPL', getDeps()),
            ).resolves.toBeUndefined()
        })

        it('should look up the symbol before deleting', async () => {
            await removeFromWatchlist('AAPL', getDeps())

            expect(mockPrisma.watchlist.findUnique).toHaveBeenCalledWith({
                where: { symbol: 'AAPL' },
            })
        })
    })

    // ─── T09-02: Delete non-existent symbol ───

    describe('T09-02: Delete non-existent symbol', () => {
        it('should throw NOT_FOUND when symbol is not in watchlist', async () => {
            mockPrisma.watchlist.findUnique = mock(() => Promise.resolve(null))

            try {
                await removeFromWatchlist('ZZZZZ', getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(RemoveWatchlistError)
                expect((error as RemoveWatchlistError).code).toBe('NOT_FOUND')
            }
        })

        it('should not call delete when symbol is not found', async () => {
            mockPrisma.watchlist.findUnique = mock(() => Promise.resolve(null))

            try {
                await removeFromWatchlist('ZZZZZ', getDeps())
            } catch {
                // expected
            }

            expect(mockPrisma.watchlist.delete).not.toHaveBeenCalled()
        })

        it('should include descriptive error message', async () => {
            mockPrisma.watchlist.findUnique = mock(() => Promise.resolve(null))

            try {
                await removeFromWatchlist('ZZZZZ', getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect((error as RemoveWatchlistError).message).toBe(
                    'Symbol not found in watchlist',
                )
            }
        })
    })

    // ─── T09-03: Invalid symbol format ───

    describe('T09-03: Invalid symbol format', () => {
        it('should throw INVALID_INPUT for empty symbol', async () => {
            try {
                await removeFromWatchlist('', getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(RemoveWatchlistError)
                expect((error as RemoveWatchlistError).code).toBe(
                    'INVALID_INPUT',
                )
            }
        })

        it('should throw INVALID_INPUT for symbol longer than 10 chars', async () => {
            try {
                await removeFromWatchlist('ABCDEFGHIJK', getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(RemoveWatchlistError)
                expect((error as RemoveWatchlistError).code).toBe(
                    'INVALID_INPUT',
                )
            }
        })

        it('should throw INVALID_INPUT for special characters', async () => {
            try {
                await removeFromWatchlist('<script>', getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(RemoveWatchlistError)
                expect((error as RemoveWatchlistError).code).toBe(
                    'INVALID_INPUT',
                )
            }
        })

        it('should not query database for invalid input', async () => {
            try {
                await removeFromWatchlist('', getDeps())
            } catch {
                // expected
            }

            expect(mockPrisma.watchlist.findUnique).not.toHaveBeenCalled()
            expect(mockPrisma.watchlist.delete).not.toHaveBeenCalled()
        })
    })

    // ─── T09-04: Case-insensitive ───

    describe('T09-04: Case-insensitive delete', () => {
        it('should convert lowercase symbol to uppercase before lookup', async () => {
            await removeFromWatchlist('aapl', getDeps())

            expect(mockPrisma.watchlist.findUnique).toHaveBeenCalledWith({
                where: { symbol: 'AAPL' },
            })
        })

        it('should convert mixed case to uppercase', async () => {
            await removeFromWatchlist('AaPl', getDeps())

            expect(mockPrisma.watchlist.findUnique).toHaveBeenCalledWith({
                where: { symbol: 'AAPL' },
            })
        })

        it('should delete using uppercase symbol', async () => {
            await removeFromWatchlist('aapl', getDeps())

            expect(mockPrisma.watchlist.delete).toHaveBeenCalledWith({
                where: { symbol: 'AAPL' },
            })
        })
    })

    // ─── T09-05: Database record removal ───

    describe('T09-05: Database record is removed', () => {
        it('should call prisma.watchlist.delete with correct symbol', async () => {
            await removeFromWatchlist('AAPL', getDeps())

            expect(mockPrisma.watchlist.delete).toHaveBeenCalledTimes(1)
            expect(mockPrisma.watchlist.delete).toHaveBeenCalledWith({
                where: { symbol: 'AAPL' },
            })
        })
    })

    // ─── TOCTOU: Race condition handling ───

    describe('TOCTOU: Race condition handling', () => {
        it('should throw NOT_FOUND when Prisma delete fails with P2025', async () => {
            const prismaError = Object.assign(
                new Error('Record to delete does not exist'),
                {
                    code: 'P2025',
                },
            )
            mockPrisma.watchlist.delete = mock(() =>
                Promise.reject(prismaError),
            )

            try {
                await removeFromWatchlist('AAPL', getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(RemoveWatchlistError)
                expect((error as RemoveWatchlistError).code).toBe('NOT_FOUND')
            }
        })

        it('should re-throw non-P2025 delete errors', async () => {
            mockPrisma.watchlist.delete = mock(() =>
                Promise.reject(new Error('Connection lost')),
            )

            try {
                await removeFromWatchlist('AAPL', getDeps())
                expect.unreachable('Should have thrown')
            } catch (error) {
                expect(error).not.toBeInstanceOf(RemoveWatchlistError)
                expect((error as Error).message).toBe('Connection lost')
            }
        })
    })
})
