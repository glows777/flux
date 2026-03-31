/**
 * GET /api/stocks/:symbol/earnings/quarters Integration Tests
 *
 * Test scenarios:
 * - Normal response → 200 with FiscalQuarter[]
 * - Auto-uppercase for lowercase symbol
 * - FmpError NOT_FOUND → 404
 * - FmpError RATE_LIMITED → 429
 * - Unknown error → 500
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import { MockFmpError, mockGetQuartersWithCache } from './helpers/mock-boundaries'

import { createHonoApp } from '@/routes/index'

// ==================== Mock data ====================

const MOCK_QUARTERS = [
    { year: 2025, quarter: 1, key: '2025-Q1', label: '2025 Q1 (2025-04-27)', date: '2025-04-27' },
    { year: 2025, quarter: 4, key: '2025-Q4', label: '2025 Q4 (2025-01-26)', date: '2025-01-26' },
    { year: 2024, quarter: 3, key: '2024-Q3', label: '2024 Q3 (2024-10-27)', date: '2024-10-27' },
]

// ==================== Test app ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('GET /api/stocks/:symbol/earnings/quarters', () => {
    beforeEach(() => {
        mockGetQuartersWithCache.mockReset()
        mockGetQuartersWithCache.mockImplementation(() =>
            Promise.resolve({ data: MOCK_QUARTERS, cached: false, cachedAt: null }),
        )
    })

    it('returns 200 with FiscalQuarter array', async () => {
        const res = await app.request('/api/stocks/NVDA/earnings/quarters')

        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.success).toBe(true)
        expect(json.data).toEqual(MOCK_QUARTERS)
    })

    it('auto-uppercases lowercase symbol', async () => {
        const res = await app.request('/api/stocks/nvda/earnings/quarters')

        expect(res.status).toBe(200)
        expect(mockGetQuartersWithCache).toHaveBeenCalledWith('NVDA')
    })

    it('returns 404 for FmpError NOT_FOUND', async () => {
        mockGetQuartersWithCache.mockImplementation(() => {
            throw new MockFmpError('Not found', 'NOT_FOUND')
        })

        const res = await app.request('/api/stocks/INVALID/earnings/quarters')

        expect(res.status).toBe(404)
        const json = await res.json()
        expect(json.success).toBe(false)
    })

    it('returns 429 for FmpError RATE_LIMITED', async () => {
        mockGetQuartersWithCache.mockImplementation(() => {
            throw new MockFmpError('Rate limited', 'RATE_LIMITED')
        })

        const res = await app.request('/api/stocks/AAPL/earnings/quarters')

        expect(res.status).toBe(429)
        const json = await res.json()
        expect(json.success).toBe(false)
    })

    it('returns 500 for unknown error', async () => {
        mockGetQuartersWithCache.mockImplementation(() => {
            throw new Error('Something unexpected')
        })

        const res = await app.request('/api/stocks/AAPL/earnings/quarters')

        expect(res.status).toBe(500)
        const json = await res.json()
        expect(json.success).toBe(false)
        expect(json.error).toBe('Failed to fetch available quarters')
    })

    it('returns 400 for invalid symbol format', async () => {
        const res = await app.request('/api/stocks/INVALID_SYMBOL_TOO_LONG/earnings/quarters')

        expect(res.status).toBe(400)
    })
})
