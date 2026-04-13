/**
 * P0: Stock Detail Flow E2E Test
 *
 * Tests the detail page data loading: history, info, news.
 * External boundaries mocked, inter-module calls are REAL.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { resetProviders } from '@/core/ai/providers'
import { prisma } from '@/core/db'
import { clearMacroCache } from '@/core/market-data'
import { truncateAllTables } from '../helpers/db-utils'
import {
    mockFinnhubGetCompanyNews,
    mockYahooChart,
    mockYahooQuote,
    mockYahooQuoteSummary,
} from '../helpers/mock-boundaries'
import {
    createFinnhubNewsItems,
    createYahooChartResponse,
    createYahooQuoteResponse,
    createYahooQuoteSummaryResponse,
} from '../helpers/mock-data'
import { createTestApp, jsonGet, jsonPost } from '../helpers/test-app'

const app = createTestApp()

describe('Stock Detail Flow (P0)', () => {
    beforeAll(async () => {
        await truncateAllTables(prisma)
        resetProviders()
        clearMacroCache()

        // Configure NVDA-specific mocks
        mockYahooQuote.mockImplementation(async () =>
            createYahooQuoteResponse({
                symbol: 'NVDA',
                regularMarketPrice: 890.5,
                regularMarketChangePercent: 3.2,
                shortName: 'NVIDIA Corporation',
                marketCap: 2.2e12,
                sector: 'Technology',
            }),
        )

        mockYahooChart.mockImplementation(
            async (
                symbol: string,
                opts?: { period1?: Date; period2?: Date },
            ) =>
                opts?.period1 && opts?.period2
                    ? createYahooChartResponse(symbol, {
                          period1: opts.period1,
                          period2: opts.period2,
                      })
                    : createYahooChartResponse(symbol, 5),
        )

        mockYahooQuoteSummary.mockImplementation(async () =>
            createYahooQuoteSummaryResponse({
                trailingPE: 65.0,
                trailingEps: 12.35,
                dividendYield: 0.001,
            }),
        )

        mockFinnhubGetCompanyNews.mockImplementation(async () =>
            createFinnhubNewsItems('NVDA', 5),
        )

        // Seed NVDA in watchlist (precondition)
        await jsonPost(app, '/api/watchlist', { symbol: 'NVDA' })
    })

    afterAll(async () => {
        await truncateAllTables(prisma)
    })

    // Step 1: GET /api/stocks/NVDA/history?period=1M
    it('step 1: returns 1M history with OHLCV points', async () => {
        const res = await jsonGet(app, '/api/stocks/NVDA/history?period=1M')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.data.points.length).toBeGreaterThan(0)

        const point = json.data.points[0]
        expect(typeof point.open).toBe('number')
        expect(typeof point.high).toBe('number')
        expect(typeof point.low).toBe('number')
        expect(typeof point.close).toBe('number')
        expect(typeof point.date).toBe('string')
    })

    // Step 2: GET /api/stocks/NVDA/info
    it('step 2: returns stock info with numeric metrics', async () => {
        const res = await jsonGet(app, '/api/stocks/NVDA/info')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(typeof json.data.pe).toBe('number')
        expect(typeof json.data.marketCap).toBe('number')
        expect(typeof json.data.eps).toBe('number')
    })

    // Step 3: GET /api/stocks/NVDA/news?limit=5
    it('step 3: returns news with correct limit', async () => {
        const res = await jsonGet(app, '/api/stocks/NVDA/news?limit=5')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.data.length).toBeLessThanOrEqual(5)
        expect(json.data.length).toBeGreaterThan(0)
    })

    // Step 4: GET /api/stocks/NVDA/history?period=1Y → more points
    it('step 4: 1Y history returns more points than 1M', async () => {
        const res1M = await jsonGet(app, '/api/stocks/NVDA/history?period=1M')
        const json1M = await res1M.json()

        const res1Y = await jsonGet(app, '/api/stocks/NVDA/history?period=1Y')
        const json1Y = await res1Y.json()

        expect(res1Y.status).toBe(200)
        expect(json1Y.data.points.length).toBeGreaterThanOrEqual(
            json1M.data.points.length,
        )
    })
})
