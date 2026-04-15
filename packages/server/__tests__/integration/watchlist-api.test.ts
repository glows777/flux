/**
 * P2-07: Watchlist API Integration Tests
 *
 * Test scenarios per spec:
 * - T07-08: GET /api/watchlist empty list returns 200 + empty array
 * - T07-09: GET /api/watchlist with data returns WatchlistItemWithChart[]
 * - T07-10: Response structure is { success: true, data: [...] }
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'

// Import after mock setup (handled by preload)
import { createHonoApp } from '@/routes/index'
import { mockGetWatchlistItems } from './helpers/mock-boundaries'

// ==================== Test app ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('GET /api/watchlist', () => {
    beforeEach(() => {
        mockGetWatchlistItems.mockReset()
        mockGetWatchlistItems.mockImplementation(() => Promise.resolve([]))
    })

    // ─── T07-08: Empty list ───

    describe('T07-08: GET /api/watchlist empty list', () => {
        it('returns 200 status code', async () => {
            const res = await app.request('/api/watchlist')

            expect(res.status).toBe(200)
        })

        it('returns empty data array', async () => {
            const res = await app.request('/api/watchlist')
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.data).toEqual([])
        })
    })

    // ─── T07-09: With data ───

    describe('T07-09: GET /api/watchlist with data', () => {
        beforeEach(() => {
            mockGetWatchlistItems.mockImplementation(() =>
                Promise.resolve([
                    {
                        id: 'NVDA',
                        name: 'NVIDIA Corporation',
                        price: 780.42,
                        chg: 2.4,
                        signal: 'buy',
                        score: 85,
                        data: Array.from({ length: 20 }, (_, i) => ({
                            date: `2024-06-${String(20 - i).padStart(2, '0')}`,
                            close: 755 + i,
                        })),
                    },
                    {
                        id: 'TSLA',
                        name: 'Tesla Inc',
                        price: 250.0,
                        chg: -1.2,
                        signal: 'hold',
                        score: 60,
                        data: Array.from({ length: 20 }, (_, i) => ({
                            date: `2024-06-${String(20 - i).padStart(2, '0')}`,
                            close: 245 + i,
                        })),
                    },
                ]),
            )
        })

        it('returns 200 status code', async () => {
            const res = await app.request('/api/watchlist')

            expect(res.status).toBe(200)
        })

        it('returns correct number of items', async () => {
            const res = await app.request('/api/watchlist')
            const json = await res.json()

            expect(json.data).toHaveLength(2)
        })

        it('returns items with correct structure', async () => {
            const res = await app.request('/api/watchlist')
            const json = await res.json()

            for (const item of json.data) {
                expect(typeof item.id).toBe('string')
                expect(typeof item.name).toBe('string')
                expect(typeof item.price).toBe('number')
                expect(typeof item.chg).toBe('number')
                expect(typeof item.signal).toBe('string')
                expect(typeof item.score).toBe('number')
                expect(Array.isArray(item.data)).toBe(true)
            }
        })

        it('returns items with 20 data points each', async () => {
            const res = await app.request('/api/watchlist')
            const json = await res.json()

            for (const item of json.data) {
                expect(item.data).toHaveLength(20)
            }
        })
    })

    // ─── T07-10: Response structure ───

    describe('T07-10: Response structure', () => {
        it('returns { success: true, data: [...] } format', async () => {
            const res = await app.request('/api/watchlist')
            const json = await res.json()

            expect(json).toHaveProperty('success', true)
            expect(json).toHaveProperty('data')
            expect(Array.isArray(json.data)).toBe(true)
        })
    })

    // ─── Error handling ───

    describe('Error handling', () => {
        it('returns 500 with generic error when database fails', async () => {
            mockGetWatchlistItems.mockImplementation(() =>
                Promise.reject(new Error('Connection refused')),
            )

            const res = await app.request('/api/watchlist')
            const json = await res.json()

            expect(res.status).toBe(500)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to fetch watchlist')
        })
    })
})
