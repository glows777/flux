/**
 * P2-10: Price History API Integration Tests
 *
 * Test scenarios per spec:
 * - T10-11: GET /api/stocks/AAPL/history returns 200 + data
 * - T10-12: GET /api/stocks/AAPL/history?period=1W returns 5 data points
 * - T10-13: Invalid symbol returns error from sync layer
 * - T10-07: Invalid period returns 400
 * - T10-08: Period case insensitive ('1m' == '1M')
 * - T10-09: Default period is '1M' when not provided
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'

// Import after mock setup (handled by preload)
import { createHonoApp } from '@/routes/index'
import { mockGetStockHistory } from './helpers/mock-boundaries'

// ==================== Mock data helpers ====================

function createMockHistoryResult(
    symbol: string,
    period: string,
    count: number,
) {
    return {
        symbol,
        period,
        points: Array.from({ length: count }, (_, i) => ({
            date: new Date(Date.UTC(2024, 5, 20 - i)).toISOString(),
            open: 100 + i,
            high: 105 + i,
            low: 95 + i,
            close: 100 + i,
        })),
    }
}

// ==================== Test app ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('GET /api/stocks/:symbol/history', () => {
    beforeEach(() => {
        mockGetStockHistory.mockReset()
        mockGetStockHistory.mockImplementation(
            async (symbol: string, period: string) => {
                const periodDays: Record<string, number> = {
                    '1D': 1,
                    '1W': 5,
                    '1M': 22,
                    '3M': 66,
                    YTD: 180,
                    '1Y': 252,
                }
                const count = periodDays[period] ?? 22
                return createMockHistoryResult(symbol, period, count)
            },
        )
    })

    // ─── T10-11: Returns 200 + data ───

    describe('T10-11: GET /api/stocks/AAPL/history returns 200 + data', () => {
        it('returns 200 status code', async () => {
            const res = await app.request('/api/stocks/AAPL/history')

            expect(res.status).toBe(200)
        })

        it('returns success: true with data', async () => {
            const res = await app.request('/api/stocks/AAPL/history')
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.data).toBeDefined()
            expect(json.data.symbol).toBe('AAPL')
            expect(json.data.period).toBe('1M')
            expect(Array.isArray(json.data.points)).toBe(true)
        })

        it('returns points with correct OHLCV structure', async () => {
            const res = await app.request('/api/stocks/AAPL/history')
            const json = await res.json()

            for (const point of json.data.points) {
                expect(typeof point.date).toBe('string')
                expect(typeof point.open).toBe('number')
                expect(typeof point.high).toBe('number')
                expect(typeof point.low).toBe('number')
                expect(typeof point.close).toBe('number')
            }
        })
    })

    // ─── T10-12: Period parameter ───

    describe('T10-12: GET /api/stocks/AAPL/history?period=1W returns 5 data points', () => {
        it('returns 5 data points for 1W period', async () => {
            const res = await app.request('/api/stocks/AAPL/history?period=1W')
            const json = await res.json()

            expect(json.data.points).toHaveLength(5)
            expect(json.data.period).toBe('1W')
        })

        it('calls getStockHistory with correct params', async () => {
            await app.request('/api/stocks/AAPL/history?period=1W')

            expect(mockGetStockHistory).toHaveBeenCalledWith('AAPL', '1W')
        })
    })

    // ─── T10-07: Invalid period ───

    describe('T10-07: Invalid period returns 400', () => {
        it('returns 400 for invalid period value', async () => {
            const res = await app.request(
                '/api/stocks/AAPL/history?period=INVALID',
            )

            expect(res.status).toBe(400)
        })

        it('returns error message with valid periods listed', async () => {
            const res = await app.request('/api/stocks/AAPL/history?period=2W')
            const json = await res.json()

            expect(json.success).toBe(false)
            expect(json.error).toContain('Invalid period')
        })
    })

    // ─── T10-08: Case insensitive period ───

    describe('T10-08: Period case insensitive', () => {
        it('accepts lowercase period', async () => {
            const res = await app.request('/api/stocks/AAPL/history?period=1m')
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.data.period).toBe('1M')
        })

        it('accepts mixed case period', async () => {
            const res = await app.request('/api/stocks/AAPL/history?period=ytd')

            expect(res.status).toBe(200)
        })
    })

    // ─── T10-09: Default period ───

    describe('T10-09: Default period is 1M', () => {
        it('uses 1M when no period parameter', async () => {
            const res = await app.request('/api/stocks/AAPL/history')
            const json = await res.json()

            expect(json.data.period).toBe('1M')
            expect(json.data.points).toHaveLength(22)
        })
    })

    // ─── T10-13: Symbol handling ───

    describe('T10-13: Symbol handling', () => {
        it('converts symbol to uppercase', async () => {
            await app.request('/api/stocks/aapl/history')

            expect(mockGetStockHistory).toHaveBeenCalledWith('AAPL', '1M')
        })

        it('returns 500 when sync layer fails', async () => {
            mockGetStockHistory.mockImplementation(async () => {
                throw new Error('Failed to fetch history for INVALID')
            })

            const res = await app.request('/api/stocks/INVALID/history')
            const json = await res.json()

            expect(res.status).toBe(500)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to fetch stock history')
        })
    })

    // ─── Symbol validation ───

    describe('Symbol validation', () => {
        it('returns 400 for symbol with invalid characters', async () => {
            const res = await app.request('/api/stocks/A@B!C/history')
            const json = await res.json()

            expect(res.status).toBe(400)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid symbol format')
        })

        it('returns 400 for symbol longer than 10 characters', async () => {
            const res = await app.request('/api/stocks/TOOLONGSYMBOL/history')
            const json = await res.json()

            expect(res.status).toBe(400)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid symbol format')
        })

        it('accepts valid symbols with dots and hyphens', async () => {
            const res = await app.request('/api/stocks/BRK.B/history')

            expect(res.status).toBe(200)
        })

        it('accepts valid symbols with caret (^VIX)', async () => {
            const res = await app.request('/api/stocks/^VIX/history')

            expect(res.status).toBe(200)
        })

        it('does not call getStockHistory for invalid symbols', async () => {
            await app.request('/api/stocks/TOOLONGSYMBOL/history')

            expect(mockGetStockHistory).not.toHaveBeenCalled()
        })
    })

    // ─── Response structure ───

    describe('Response structure', () => {
        it('returns { success: true, data: { symbol, period, points } }', async () => {
            const res = await app.request('/api/stocks/NVDA/history?period=1D')
            const json = await res.json()

            expect(json).toHaveProperty('success', true)
            expect(json).toHaveProperty('data')
            expect(json.data).toHaveProperty('symbol', 'NVDA')
            expect(json.data).toHaveProperty('period', '1D')
            expect(json.data).toHaveProperty('points')
        })
    })
})
