/**
 * P2-12: News API Integration Tests
 *
 * Test scenarios per spec:
 * - T12-16: GET /api/stocks/AAPL/news → 200 + NewsItem[]
 * - T12-17: GET /api/stocks/AAPL/news?limit=5 → ≤ 5 items
 * - T12-18: GET /api/stocks/invalid!!!/news → 400 Invalid symbol
 * - T12-19: GET /api/stocks/AAPL/news?limit=abc → 400 Invalid limit
 * - T12-20: GET /api/stocks/AAPL/news?limit=0 → 400 Invalid limit
 * - T12-21: GET /api/stocks/AAPL/news?limit=100 → 400 Invalid limit
 * - T12-22: No limit param → default 20 items
 * - T12-23: Finnhub service error → 500
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import type { NewsItem } from '@flux/shared'
// Import after mock setup (handled by preload)
import { createHonoApp } from '@/routes/index'
import { mockGetStockNews } from './helpers/mock-boundaries'

// ==================== Mock data helpers ====================

function createMockNewsItem(overrides?: Partial<NewsItem>): NewsItem {
    return {
        id: 'cuid-1',
        source: 'Reuters',
        time: '2023-11-14T22:13:20.000Z',
        title: 'AAPL reports strong quarter',
        sentiment: 'neutral',
        url: 'https://reuters.com/article/aapl',
        summary: 'Apple reported better-than-expected earnings.',
        ...overrides,
    }
}

// ==================== Test app ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('GET /api/stocks/:symbol/news', () => {
    beforeEach(() => {
        mockGetStockNews.mockReset()
        mockGetStockNews.mockImplementation(
            async (_symbol: string, _limit?: number) => [createMockNewsItem()],
        )
    })

    // ─── T12-16: Normal request ───

    describe('T12-16: GET /api/stocks/AAPL/news', () => {
        it('returns 200 status code', async () => {
            const res = await app.request('/api/stocks/AAPL/news')
            expect(res.status).toBe(200)
        })

        it('returns success: true with data array', async () => {
            const res = await app.request('/api/stocks/AAPL/news')
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(Array.isArray(json.data)).toBe(true)
        })

        it('returns NewsItem format in data', async () => {
            const res = await app.request('/api/stocks/AAPL/news')
            const json = await res.json()

            expect(json.data[0]).toHaveProperty('id')
            expect(json.data[0]).toHaveProperty('source')
            expect(json.data[0]).toHaveProperty('time')
            expect(json.data[0]).toHaveProperty('title')
            expect(json.data[0]).toHaveProperty('sentiment')
        })

        it('calls getStockNews with uppercase symbol', async () => {
            await app.request('/api/stocks/aapl/news')
            expect(mockGetStockNews).toHaveBeenCalledWith('AAPL', 20)
        })
    })

    // ─── T12-17: With limit ───

    describe('T12-17: GET /api/stocks/AAPL/news?limit=5', () => {
        it('passes limit to getStockNews', async () => {
            await app.request('/api/stocks/AAPL/news?limit=5')
            expect(mockGetStockNews).toHaveBeenCalledWith('AAPL', 5)
        })

        it('returns 200', async () => {
            const res = await app.request('/api/stocks/AAPL/news?limit=5')
            expect(res.status).toBe(200)
        })
    })

    // ─── T12-18: Invalid symbol ───

    describe('T12-18: GET /api/stocks/invalid!!!/news', () => {
        it('returns 400 for invalid symbol', async () => {
            const res = await app.request('/api/stocks/invalid!!!/news')
            const json = await res.json()

            expect(res.status).toBe(400)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid symbol format')
        })

        it('does not call getStockNews', async () => {
            await app.request('/api/stocks/invalid!!!/news')
            expect(mockGetStockNews).not.toHaveBeenCalled()
        })
    })

    // ─── T12-19: Invalid limit (non-numeric) ───

    describe('T12-19: GET /api/stocks/AAPL/news?limit=abc', () => {
        it('returns 400 for non-numeric limit', async () => {
            const res = await app.request('/api/stocks/AAPL/news?limit=abc')
            const json = await res.json()

            expect(res.status).toBe(400)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid limit. Must be 1-50')
        })
    })

    // ─── T12-20: limit=0 ───

    describe('T12-20: GET /api/stocks/AAPL/news?limit=0', () => {
        it('returns 400 for limit < 1', async () => {
            const res = await app.request('/api/stocks/AAPL/news?limit=0')
            const json = await res.json()

            expect(res.status).toBe(400)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid limit. Must be 1-50')
        })
    })

    // ─── T12-21: limit=100 ───

    describe('T12-21: GET /api/stocks/AAPL/news?limit=100', () => {
        it('returns 400 for limit > 50', async () => {
            const res = await app.request('/api/stocks/AAPL/news?limit=100')
            const json = await res.json()

            expect(res.status).toBe(400)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid limit. Must be 1-50')
        })
    })

    // ─── T12-22: No limit → default 20 ───

    describe('T12-22: No limit parameter', () => {
        it('defaults to limit 20', async () => {
            await app.request('/api/stocks/AAPL/news')
            expect(mockGetStockNews).toHaveBeenCalledWith('AAPL', 20)
        })
    })

    // ─── T12-23: Service error → 500 ───

    describe('T12-23: Finnhub service error', () => {
        it('returns 500 when getStockNews throws', async () => {
            mockGetStockNews.mockImplementation(async () => {
                throw new Error('Finnhub API error: 500')
            })

            const res = await app.request('/api/stocks/AAPL/news')
            const json = await res.json()

            expect(res.status).toBe(500)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to fetch news')
        })
    })

    // ─── Symbol validation extras ───

    describe('Symbol validation', () => {
        it('accepts symbols with dots (BRK.B)', async () => {
            const res = await app.request('/api/stocks/BRK.B/news')
            expect(res.status).toBe(200)
        })

        it('accepts symbols with caret (^VIX)', async () => {
            const res = await app.request('/api/stocks/^VIX/news')
            expect(res.status).toBe(200)
        })

        it('returns 400 for symbol longer than 10 chars', async () => {
            const res = await app.request('/api/stocks/TOOLONGSYMBOL/news')
            expect(res.status).toBe(400)
        })
    })
})
