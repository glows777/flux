/**
 * P2-08: Add to Watchlist Integration Tests
 *
 * Test scenarios per spec:
 * - T08-11: Complete add flow — POST succeeds, returns 201 with WatchlistItemWithChart
 * - T08-12: Duplicate add — second POST returns 409
 * - Input validation at route level (400 for invalid input)
 * - Symbol not found (404)
 * - Internal server error (500)
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'

// Import after mock setup (handled by preload)
import { createHonoApp } from '@/routes/index'
import {
    MockAddWatchlistError,
    mockAddToWatchlist,
} from './helpers/mock-boundaries'

// ==================== Test app ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('POST /api/watchlist', () => {
    beforeEach(() => {
        mockAddToWatchlist.mockReset()

        // Default: successful add
        mockAddToWatchlist.mockImplementation(() =>
            Promise.resolve({
                id: 'AAPL',
                name: 'Apple Inc.',
                price: 150.0,
                chg: 1.5,
                signal: 'hold',
                score: 70,
                data: Array.from({ length: 20 }, (_, i) => ({
                    date: `2024-06-${String(20 - i).padStart(2, '0')}`,
                    close: 150 + i,
                })),
            }),
        )
    })

    // ─── T08-11: Complete add flow ───

    describe('T08-11: Complete add flow', () => {
        it('returns 201 status code on success', async () => {
            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'AAPL' }),
            })

            expect(res.status).toBe(201)
        })

        it('returns success: true with data', async () => {
            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'AAPL' }),
            })
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.data).toBeDefined()
        })

        it('returns WatchlistItemWithChart structure', async () => {
            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'AAPL' }),
            })
            const json = await res.json()

            expect(typeof json.data.id).toBe('string')
            expect(typeof json.data.name).toBe('string')
            expect(typeof json.data.price).toBe('number')
            expect(typeof json.data.chg).toBe('number')
            expect(typeof json.data.signal).toBe('string')
            expect(typeof json.data.score).toBe('number')
            expect(Array.isArray(json.data.data)).toBe(true)
        })

        it('returns correct symbol in response', async () => {
            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'AAPL' }),
            })
            const json = await res.json()

            expect(json.data.id).toBe('AAPL')
        })
    })

    // ─── T08-12: Duplicate add ───

    describe('T08-12: Duplicate add returns 409', () => {
        it('returns 409 when symbol already exists', async () => {
            mockAddToWatchlist.mockImplementation(() =>
                Promise.reject(
                    new MockAddWatchlistError(
                        'Symbol already in watchlist',
                        'DUPLICATE',
                    ),
                ),
            )

            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'AAPL' }),
            })

            expect(res.status).toBe(409)
        })

        it('returns error message for duplicate', async () => {
            mockAddToWatchlist.mockImplementation(() =>
                Promise.reject(
                    new MockAddWatchlistError(
                        'Symbol already in watchlist',
                        'DUPLICATE',
                    ),
                ),
            )

            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'AAPL' }),
            })
            const json = await res.json()

            expect(json.success).toBe(false)
            expect(json.error).toBe('Symbol already in watchlist')
        })
    })

    // ─── Input validation ───

    describe('Input validation', () => {
        it('returns 400 for empty symbol', async () => {
            mockAddToWatchlist.mockImplementation(() =>
                Promise.reject(
                    new MockAddWatchlistError(
                        'Invalid symbol format',
                        'INVALID_INPUT',
                    ),
                ),
            )

            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: '' }),
            })

            expect(res.status).toBe(400)
        })

        it('returns 400 for missing symbol', async () => {
            mockAddToWatchlist.mockImplementation(() =>
                Promise.reject(
                    new MockAddWatchlistError(
                        'Invalid symbol format',
                        'INVALID_INPUT',
                    ),
                ),
            )

            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            })

            expect(res.status).toBe(400)
        })

        it('returns error message for invalid input', async () => {
            mockAddToWatchlist.mockImplementation(() =>
                Promise.reject(
                    new MockAddWatchlistError(
                        'Invalid symbol format',
                        'INVALID_INPUT',
                    ),
                ),
            )

            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: '' }),
            })
            const json = await res.json()

            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid symbol format')
        })

        it('returns 400 for malformed JSON body', async () => {
            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'not valid json',
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid JSON body')
        })
    })

    // ─── Symbol not found ───

    describe('Symbol not found', () => {
        it('returns 404 when symbol does not exist in market', async () => {
            mockAddToWatchlist.mockImplementation(() =>
                Promise.reject(
                    new MockAddWatchlistError(
                        'Invalid symbol or unable to fetch data',
                        'SYMBOL_NOT_FOUND',
                    ),
                ),
            )

            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'ZZZZZ' }),
            })

            expect(res.status).toBe(404)
        })

        it('returns error message for unknown symbol', async () => {
            mockAddToWatchlist.mockImplementation(() =>
                Promise.reject(
                    new MockAddWatchlistError(
                        'Invalid symbol or unable to fetch data',
                        'SYMBOL_NOT_FOUND',
                    ),
                ),
            )

            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'ZZZZZ' }),
            })
            const json = await res.json()

            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid symbol or unable to fetch data')
        })
    })

    // ─── Internal server error ───

    describe('Internal server error', () => {
        it('returns 500 for unexpected errors', async () => {
            mockAddToWatchlist.mockImplementation(() =>
                Promise.reject(new Error('Database connection lost')),
            )

            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'AAPL' }),
            })

            expect(res.status).toBe(500)
        })

        it('returns generic error message for 500', async () => {
            mockAddToWatchlist.mockImplementation(() =>
                Promise.reject(new Error('Database connection lost')),
            )

            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'AAPL' }),
            })
            const json = await res.json()

            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to add to watchlist')
        })
    })

    // ─── Auto uppercase at route level ───

    describe('Auto uppercase', () => {
        it('converts lowercase symbol to uppercase', async () => {
            const res = await app.request('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'aapl' }),
            })
            const json = await res.json()

            expect(res.status).toBe(201)
            expect(json.data.id).toBe('AAPL')
        })
    })
})
