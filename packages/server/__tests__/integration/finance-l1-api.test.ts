/**
 * Phase 3 Step 5: GET /api/stocks/:symbol/earnings Integration Tests
 *
 * Test scenarios:
 * - Normal response → 200 + CachedEarningsL1
 * - Year/quarter query params → passed to getL1WithCache
 * - Default (no params) → works without year/quarter
 * - Auto uppercase → lowercase symbol converted
 * - Invalid symbol → 400
 * - Invalid quarter (0, 5, abc) → 400
 * - Invalid year (abc) → 400
 * - FmpError NOT_FOUND → 404
 * - FmpError CONFIG_ERROR → 500
 * - FmpError RATE_LIMITED → 429
 * - FmpError API_ERROR → 502
 * - FmpError PARSE_ERROR → 502
 * - Unknown error → 500
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import { MockFmpError, mockGetL1WithCache } from './helpers/mock-boundaries'

import { createHonoApp } from '@/routes/index'

// ==================== Mock data ====================

const MOCK_L1_RESPONSE = {
    data: {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        period: 'FY2025 Q1',
        reportDate: '2025-01-30',
        beatMiss: {
            revenue: { actual: 124300000000, expected: 118900000000 },
            eps: { actual: 2.18, expected: 2.11 },
        },
        margins: [
            { quarter: 'Q1 2025', gross: 46.9, operating: 33.5, net: 28.2 },
            { quarter: 'Q4 2024', gross: 46.2, operating: 30.8, net: 25.0 },
        ],
        keyFinancials: {
            revenue: 124300000000,
            revenueYoY: 4.0,
            operatingIncome: 41600000000,
            fcf: 30000000000,
            debtToAssets: 0.32,
        },
    },
    cached: false,
    cachedAt: null,
    reportDate: '2025-01-30T00:00:00.000Z',
}

// ==================== Test app ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('GET /api/stocks/:symbol/earnings', () => {
    beforeEach(() => {
        mockGetL1WithCache.mockReset()
        mockGetL1WithCache.mockImplementation(async () => MOCK_L1_RESPONSE)
    })

    // ─── Normal response ───

    describe('Normal response', () => {
        it('returns 200 status code', async () => {
            const res = await app.request('/api/stocks/AAPL/earnings')
            expect(res.status).toBe(200)
        })

        it('returns success: true with CachedEarningsL1 data', async () => {
            const res = await app.request('/api/stocks/AAPL/earnings')
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.data).toBeDefined()
            expect(json.data.data.symbol).toBe('AAPL')
            expect(json.data.data.period).toBe('FY2025 Q1')
            expect(json.data.cached).toBe(false)
            expect(json.data.reportDate).toBe('2025-01-30T00:00:00.000Z')
        })

        it('returns L1 data structure with beatMiss, margins, keyFinancials', async () => {
            const res = await app.request('/api/stocks/AAPL/earnings')
            const json = await res.json()
            const l1 = json.data.data

            expect(l1.beatMiss).toBeDefined()
            expect(l1.margins).toBeInstanceOf(Array)
            expect(l1.keyFinancials).toBeDefined()
            expect(l1.keyFinancials.revenue).toBe(124300000000)
        })
    })

    // ─── Query params ───

    describe('Query parameters', () => {
        it('passes year and quarter to getL1WithCache', async () => {
            await app.request('/api/stocks/AAPL/earnings?year=2024&quarter=3')

            expect(mockGetL1WithCache).toHaveBeenCalledWith('AAPL', 2024, 3, false)
        })

        it('works without year/quarter (defaults)', async () => {
            await app.request('/api/stocks/AAPL/earnings')

            expect(mockGetL1WithCache).toHaveBeenCalledWith('AAPL', undefined, undefined, false)
        })

        it('passes only year when quarter is not provided', async () => {
            await app.request('/api/stocks/AAPL/earnings?year=2024')

            expect(mockGetL1WithCache).toHaveBeenCalledWith('AAPL', 2024, undefined, false)
        })

        it('passes only quarter when year is not provided', async () => {
            await app.request('/api/stocks/AAPL/earnings?quarter=2')

            expect(mockGetL1WithCache).toHaveBeenCalledWith('AAPL', undefined, 2, false)
        })

        it('passes forceRefresh=true when specified', async () => {
            await app.request('/api/stocks/AAPL/earnings?forceRefresh=true')

            expect(mockGetL1WithCache).toHaveBeenCalledWith('AAPL', undefined, undefined, true)
        })
    })

    // ─── Auto uppercase ───

    describe('Auto uppercase', () => {
        it('converts lowercase symbol to uppercase', async () => {
            await app.request('/api/stocks/aapl/earnings')

            expect(mockGetL1WithCache).toHaveBeenCalledWith('AAPL', undefined, undefined, false)
        })
    })

    // ─── Validation errors ───

    describe('Validation errors', () => {
        it('returns 400 for invalid symbol format', async () => {
            const res = await app.request('/api/stocks/invalid!!!/earnings')

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for quarter=0', async () => {
            const res = await app.request('/api/stocks/AAPL/earnings?quarter=0')

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for quarter=5', async () => {
            const res = await app.request('/api/stocks/AAPL/earnings?quarter=5')

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for non-numeric quarter', async () => {
            const res = await app.request('/api/stocks/AAPL/earnings?quarter=abc')

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for non-numeric year', async () => {
            const res = await app.request('/api/stocks/AAPL/earnings?year=abc')

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })
    })

    // ─── FmpError mapping ───

    describe('FmpError mapping', () => {
        it('returns 404 for FmpError NOT_FOUND', async () => {
            mockGetL1WithCache.mockImplementation(() =>
                Promise.reject(new MockFmpError('Stock not found', 'NOT_FOUND')),
            )

            const res = await app.request('/api/stocks/AAPL/earnings')

            expect(res.status).toBe(404)
            const json = await res.json()
            expect(json.success).toBe(false)
            expect(json.error).toBe('Stock not found')
        })

        it('returns 500 for FmpError CONFIG_ERROR', async () => {
            mockGetL1WithCache.mockImplementation(() =>
                Promise.reject(new MockFmpError('FMP API key not configured', 'CONFIG_ERROR')),
            )

            const res = await app.request('/api/stocks/AAPL/earnings')

            expect(res.status).toBe(500)
            const json = await res.json()
            expect(json.success).toBe(false)
            expect(json.error).toBe('FMP API key not configured')
        })

        it('returns 429 for FmpError RATE_LIMITED', async () => {
            mockGetL1WithCache.mockImplementation(() =>
                Promise.reject(new MockFmpError('Rate limited', 'RATE_LIMITED')),
            )

            const res = await app.request('/api/stocks/AAPL/earnings')

            expect(res.status).toBe(429)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 502 for FmpError API_ERROR', async () => {
            mockGetL1WithCache.mockImplementation(() =>
                Promise.reject(new MockFmpError('FMP upstream error', 'API_ERROR')),
            )

            const res = await app.request('/api/stocks/AAPL/earnings')

            expect(res.status).toBe(502)
        })

        it('returns 502 for FmpError PARSE_ERROR', async () => {
            mockGetL1WithCache.mockImplementation(() =>
                Promise.reject(new MockFmpError('Parse failed', 'PARSE_ERROR')),
            )

            const res = await app.request('/api/stocks/AAPL/earnings')

            expect(res.status).toBe(502)
        })
    })

    // ─── Unknown error ───

    describe('Unknown error', () => {
        it('returns 500 for unexpected errors', async () => {
            mockGetL1WithCache.mockImplementation(() =>
                Promise.reject(new Error('Unexpected DB failure')),
            )

            const res = await app.request('/api/stocks/AAPL/earnings')

            expect(res.status).toBe(500)
            const json = await res.json()
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to fetch earnings data')
        })
    })

    // ─── Cached response ───

    describe('Cached response', () => {
        it('returns cached: true when data comes from cache', async () => {
            mockGetL1WithCache.mockImplementation(async () => ({
                ...MOCK_L1_RESPONSE,
                cached: true,
                cachedAt: '2025-01-30T12:00:00.000Z',
            }))

            const res = await app.request('/api/stocks/AAPL/earnings')
            const json = await res.json()

            expect(json.data.cached).toBe(true)
            expect(json.data.cachedAt).toBe('2025-01-30T12:00:00.000Z')
        })
    })
})
