/**
 * Phase 3 Step 5: POST /api/stocks/:symbol/earnings/analysis Integration Tests
 *
 * Test scenarios:
 * - Normal response → 200 + CachedEarningsL2
 * - Year/quarter/forceRefresh body params → passed correctly
 * - Missing body → 400 (year/quarter required)
 * - Missing year → 400
 * - Missing quarter → 400
 * - Invalid symbol → 400
 * - Invalid quarter (0, 5) → 400
 * - Auto uppercase → lowercase symbol converted
 * - L1 fetch → called internally before L2
 * - FmpError NOT_FOUND → 404 (no transcript)
 * - FmpError API_ERROR → 502
 * - FmpError RATE_LIMITED → 429
 * - Unknown error → 500
 * - L1 failure propagation → appropriate status
 * - forceRefresh → passed to both L1 and L2
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import { MockFmpError, mockGetL1WithCache, mockGetL2WithCache } from './helpers/mock-boundaries'

import { createHonoApp } from '@/routes/index'

// ==================== Mock data ====================

const MOCK_L1_DATA = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    period: 'FY2025 Q1',
    reportDate: '2025-01-30',
    beatMiss: { revenue: null, eps: null },
    margins: [],
    keyFinancials: {
        revenue: 124300000000,
        revenueYoY: null,
        operatingIncome: 41600000000,
        fcf: null,
        debtToAssets: null,
    },
}

const MOCK_L1_RESPONSE = {
    data: MOCK_L1_DATA,
    cached: false,
    cachedAt: null,
    reportDate: '2025-01-30T00:00:00.000Z',
}

const MOCK_L2_RESPONSE = {
    data: {
        symbol: 'AAPL',
        period: 'FY2025 Q1',
        tldr: 'Apple reported strong Q1 2025 results driven by iPhone and Services growth.',
        guidance: {
            nextQuarterRevenue: '$90-93B',
            fullYearAdjustment: '维持',
            keyQuote: 'We expect continued momentum across our product lines.',
            signal: '正面',
        },
        segments: [
            { name: 'iPhone', value: '$69.1B', yoy: '+6%', comment: 'Pro 系列持续增长' },
            { name: 'Services', value: '$26.3B', yoy: '+14%', comment: '订阅收入创新高' },
        ],
        managementSignals: {
            tone: '乐观',
            keyPhrases: ['record revenue', 'strong demand'],
            quotes: [{ en: 'Best quarter ever for Services.', cn: '服务业务最佳季度表现。' }],
            analystFocus: ['China market', 'AI features'],
        },
        suggestedQuestions: ['iPhone 在中国的增长前景？', 'AI 功能对收入的贡献？'],
    },
    cached: false,
    cachedAt: null,
    reportDate: '2025-01-30T00:00:00.000Z',
}

// ==================== Test app ====================

const app = createHonoApp()

function postAnalysis(symbol: string, body?: Record<string, unknown>) {
    return app.request(`/api/stocks/${symbol}/earnings/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    })
}

// ==================== Tests ====================

describe('POST /api/stocks/:symbol/earnings/analysis', () => {
    beforeEach(() => {
        mockGetL1WithCache.mockReset()
        mockGetL2WithCache.mockReset()

        mockGetL1WithCache.mockImplementation(async () => MOCK_L1_RESPONSE)
        mockGetL2WithCache.mockImplementation(async () => MOCK_L2_RESPONSE)
    })

    // ─── Normal response ───

    describe('Normal response', () => {
        it('returns 200 status code', async () => {
            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })
            expect(res.status).toBe(200)
        })

        it('returns success: true with CachedEarningsL2 data', async () => {
            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.data).toBeDefined()
            expect(json.data.data.symbol).toBe('AAPL')
            expect(json.data.data.tldr).toContain('Apple')
            expect(json.data.cached).toBe(false)
            expect(json.data.reportDate).toBe('2025-01-30T00:00:00.000Z')
        })

        it('returns L2 data with guidance, segments, managementSignals', async () => {
            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })
            const json = await res.json()
            const l2 = json.data.data

            expect(l2.guidance).toBeDefined()
            expect(l2.guidance.signal).toBe('正面')
            expect(l2.segments).toBeInstanceOf(Array)
            expect(l2.segments.length).toBe(2)
            expect(l2.managementSignals.tone).toBe('乐观')
            expect(l2.suggestedQuestions).toBeInstanceOf(Array)
        })
    })

    // ─── L1 fetched internally ───

    describe('Internal L1 fetch', () => {
        it('calls getL1WithCache before getL2WithCache', async () => {
            await postAnalysis('AAPL', { year: 2025, quarter: 1 })

            expect(mockGetL1WithCache).toHaveBeenCalledWith('AAPL', 2025, 1, false)
            expect(mockGetL2WithCache).toHaveBeenCalledWith(
                'AAPL', 2025, 1, MOCK_L1_DATA, false,
            )
        })

        it('passes L1 data to L2 service', async () => {
            await postAnalysis('AAPL', { year: 2025, quarter: 1 })

            const l2Call = mockGetL2WithCache.mock.calls[0]
            // l2Call = [symbol, year, quarter, l1Data, forceRefresh]
            expect(l2Call[3]).toEqual(MOCK_L1_DATA)
        })
    })

    // ─── forceRefresh ───

    describe('Force refresh', () => {
        it('passes forceRefresh=true to both L1 and L2', async () => {
            await postAnalysis('AAPL', { year: 2025, quarter: 1, forceRefresh: true })

            expect(mockGetL1WithCache).toHaveBeenCalledWith('AAPL', 2025, 1, true)
            expect(mockGetL2WithCache).toHaveBeenCalledWith(
                'AAPL', 2025, 1, MOCK_L1_DATA, true,
            )
        })

        it('defaults forceRefresh to false', async () => {
            await postAnalysis('AAPL', { year: 2025, quarter: 1 })

            expect(mockGetL1WithCache).toHaveBeenCalledWith('AAPL', 2025, 1, false)
        })
    })

    // ─── Auto uppercase ───

    describe('Auto uppercase', () => {
        it('converts lowercase symbol to uppercase', async () => {
            await postAnalysis('aapl', { year: 2025, quarter: 1 })

            expect(mockGetL1WithCache).toHaveBeenCalledWith('AAPL', 2025, 1, false)
        })
    })

    // ─── Validation errors ───

    describe('Validation errors', () => {
        it('returns 400 for invalid symbol format', async () => {
            const res = await postAnalysis('invalid!!!', { year: 2025, quarter: 1 })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 when body is missing', async () => {
            const res = await app.request('/api/stocks/AAPL/earnings/analysis', {
                method: 'POST',
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 when year is missing', async () => {
            const res = await postAnalysis('AAPL', { quarter: 1 })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 when quarter is missing', async () => {
            const res = await postAnalysis('AAPL', { year: 2025 })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for quarter=0', async () => {
            const res = await postAnalysis('AAPL', { year: 2025, quarter: 0 })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for quarter=5', async () => {
            const res = await postAnalysis('AAPL', { year: 2025, quarter: 5 })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })
    })

    // ─── FmpError mapping ───

    describe('FmpError mapping', () => {
        it('returns 404 for FmpError NOT_FOUND (no transcript)', async () => {
            mockGetL2WithCache.mockImplementation(() =>
                Promise.reject(new MockFmpError('Transcript not found', 'NOT_FOUND')),
            )

            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })

            expect(res.status).toBe(404)
            const json = await res.json()
            expect(json.success).toBe(false)
            expect(json.error).toBe('Transcript not found')
        })

        it('returns 502 for FmpError API_ERROR', async () => {
            mockGetL2WithCache.mockImplementation(() =>
                Promise.reject(new MockFmpError('FMP upstream error', 'API_ERROR')),
            )

            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })

            expect(res.status).toBe(502)
        })

        it('returns 429 for FmpError RATE_LIMITED', async () => {
            mockGetL2WithCache.mockImplementation(() =>
                Promise.reject(new MockFmpError('Rate limited', 'RATE_LIMITED')),
            )

            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })

            expect(res.status).toBe(429)
        })

        it('returns 502 for FmpError PARSE_ERROR (AI output invalid)', async () => {
            mockGetL2WithCache.mockImplementation(() =>
                Promise.reject(new MockFmpError('AI output parse failed', 'PARSE_ERROR')),
            )

            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })

            expect(res.status).toBe(502)
        })
    })

    // ─── L1 failure propagation ───

    describe('L1 failure propagation', () => {
        it('returns mapped status when L1 fetch fails with FmpError', async () => {
            mockGetL1WithCache.mockImplementation(() =>
                Promise.reject(new MockFmpError('Stock not found', 'NOT_FOUND')),
            )

            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })

            expect(res.status).toBe(404)
            expect(mockGetL2WithCache).not.toHaveBeenCalled()
        })

        it('returns 500 when L1 fetch fails with unknown error', async () => {
            mockGetL1WithCache.mockImplementation(() =>
                Promise.reject(new Error('DB connection failed')),
            )

            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })

            expect(res.status).toBe(500)
            expect(mockGetL2WithCache).not.toHaveBeenCalled()
        })
    })

    // ─── Unknown error ───

    describe('Unknown error', () => {
        it('returns 500 for unexpected errors', async () => {
            mockGetL2WithCache.mockImplementation(() =>
                Promise.reject(new Error('Unexpected failure')),
            )

            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })

            expect(res.status).toBe(500)
            const json = await res.json()
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to generate earnings analysis')
        })
    })

    // ─── Cached response ───

    describe('Cached response', () => {
        it('returns cached: true when L2 comes from cache', async () => {
            mockGetL2WithCache.mockImplementation(async () => ({
                ...MOCK_L2_RESPONSE,
                cached: true,
                cachedAt: '2025-01-31T08:00:00.000Z',
            }))

            const res = await postAnalysis('AAPL', { year: 2025, quarter: 1 })
            const json = await res.json()

            expect(json.data.cached).toBe(true)
            expect(json.data.cachedAt).toBe('2025-01-31T08:00:00.000Z')
        })
    })

    // ─── Invalid JSON body ───

    describe('Invalid JSON body', () => {
        it('returns 400 for malformed JSON', async () => {
            const res = await app.request('/api/stocks/AAPL/earnings/analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{invalid json',
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })
    })
})
