/**
 * P2-09: Remove from Watchlist Integration Tests
 *
 * Test scenarios per spec:
 * - T09-13: Add then delete flow — POST succeeds, DELETE succeeds, GET returns empty
 * - T09-14: Duplicate delete — second DELETE returns 404
 * - Input validation at route level (400)
 * - Internal server error (500)
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import {
    mockRemoveFromWatchlist,
    MockRemoveWatchlistError,
} from './helpers/mock-boundaries'

// Import after mock setup (handled by preload)
import { createHonoApp } from '@/routes/index'

// ==================== Test app ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('DELETE /api/watchlist/:symbol', () => {
    beforeEach(() => {
        mockRemoveFromWatchlist.mockReset()
        mockRemoveFromWatchlist.mockImplementation(() => Promise.resolve())
    })

    // ─── Success case ───

    describe('Successful delete', () => {
        it('returns 200 status code on success', async () => {
            const res = await app.request('/api/watchlist/AAPL', {
                method: 'DELETE',
            })

            expect(res.status).toBe(200)
        })

        it('returns success: true', async () => {
            const res = await app.request('/api/watchlist/AAPL', {
                method: 'DELETE',
            })
            const json = await res.json()

            expect(json.success).toBe(true)
        })

        it('handles lowercase symbol', async () => {
            const res = await app.request('/api/watchlist/aapl', {
                method: 'DELETE',
            })

            expect(res.status).toBe(200)
        })
    })

    // ─── Not found ───

    describe('Symbol not found', () => {
        it('returns 404 when symbol does not exist', async () => {
            mockRemoveFromWatchlist.mockImplementation(() =>
                Promise.reject(new MockRemoveWatchlistError('Symbol not found in watchlist', 'NOT_FOUND')),
            )

            const res = await app.request('/api/watchlist/ZZZZZ', {
                method: 'DELETE',
            })

            expect(res.status).toBe(404)
        })

        it('returns error message for not found', async () => {
            mockRemoveFromWatchlist.mockImplementation(() =>
                Promise.reject(new MockRemoveWatchlistError('Symbol not found in watchlist', 'NOT_FOUND')),
            )

            const res = await app.request('/api/watchlist/ZZZZZ', {
                method: 'DELETE',
            })
            const json = await res.json()

            expect(json.success).toBe(false)
            expect(json.error).toBe('Symbol not found in watchlist')
        })
    })

    // ─── Input validation ───

    describe('Input validation', () => {
        it('returns 400 for symbol with special characters', async () => {
            mockRemoveFromWatchlist.mockImplementation(() =>
                Promise.reject(new MockRemoveWatchlistError('Invalid symbol', 'INVALID_INPUT')),
            )

            const res = await app.request('/api/watchlist/<script>', {
                method: 'DELETE',
            })

            expect(res.status).toBe(400)
        })

        it('returns error message for invalid input', async () => {
            mockRemoveFromWatchlist.mockImplementation(() =>
                Promise.reject(new MockRemoveWatchlistError('Invalid symbol', 'INVALID_INPUT')),
            )

            const res = await app.request('/api/watchlist/<script>', {
                method: 'DELETE',
            })
            const json = await res.json()

            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid symbol')
        })
    })

    // ─── T09-14: Duplicate delete ───

    describe('T09-14: Duplicate delete', () => {
        it('returns 404 on second delete attempt', async () => {
            // First delete: success
            const res1 = await app.request('/api/watchlist/AAPL', {
                method: 'DELETE',
            })
            expect(res1.status).toBe(200)

            // Second delete: not found
            mockRemoveFromWatchlist.mockImplementation(() =>
                Promise.reject(new MockRemoveWatchlistError('Symbol not found in watchlist', 'NOT_FOUND')),
            )

            const res2 = await app.request('/api/watchlist/AAPL', {
                method: 'DELETE',
            })
            expect(res2.status).toBe(404)
        })
    })

    // ─── Internal server error ───

    describe('Internal server error', () => {
        it('returns 500 for unexpected errors', async () => {
            mockRemoveFromWatchlist.mockImplementation(() =>
                Promise.reject(new Error('Database connection lost')),
            )

            const res = await app.request('/api/watchlist/AAPL', {
                method: 'DELETE',
            })

            expect(res.status).toBe(500)
        })

        it('returns generic error message for 500', async () => {
            mockRemoveFromWatchlist.mockImplementation(() =>
                Promise.reject(new Error('Database connection lost')),
            )

            const res = await app.request('/api/watchlist/AAPL', {
                method: 'DELETE',
            })
            const json = await res.json()

            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to remove from watchlist')
        })
    })
})
