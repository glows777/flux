/**
 * P3: Cascade Error E2E Test
 *
 * Tests error propagation from external boundaries through
 * the internal module pipeline to the HTTP response.
 */

import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { resetProviders } from '@/core/ai/providers'
import { prisma } from '@/core/db'
import { clearAllMemoryCaches } from '@/core/market-data'
import {
    seedNewsArticles,
    seedWatchlist,
    truncateAllTables,
} from '../helpers/db-utils'
import {
    mockFinnhubGetCompanyNews,
    mockYahooChart,
    mockYahooQuote,
    mockYahooQuoteSummary,
} from '../helpers/mock-boundaries'
import {
    createYahooChartResponse,
    createYahooQuoteResponse,
    createYahooQuoteSummaryResponse,
} from '../helpers/mock-data'
import { createTestApp, jsonGet, jsonPost } from '../helpers/test-app'

const app = createTestApp()

describe('Cascade Error (P3)', () => {
    beforeEach(async () => {
        await truncateAllTables(prisma)
        clearAllMemoryCaches()
        resetProviders()

        mockYahooQuote.mockImplementation(async () =>
            createYahooQuoteResponse(),
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
            createYahooQuoteSummaryResponse(),
        )
        mockFinnhubGetCompanyNews.mockImplementation(async () => [])
    })

    afterAll(async () => {
        await truncateAllTables(prisma)
    })

    // ─── Market data unavailable → add watchlist fails ───

    it('returns 404 (SYMBOL_NOT_FOUND) when Yahoo throws during add', async () => {
        mockYahooQuote.mockImplementation(async () => {
            throw new Error('Yahoo Finance unavailable')
        })

        const res = await jsonPost(app, '/api/watchlist', { symbol: 'FAKE' })
        const json = await res.json()

        expect(res.status).toBe(404)
        expect(json.success).toBe(false)
    })

    // ─── Finnhub 403 + stale cache ───

    it('returns stale news when Finnhub returns 403', async () => {
        await seedWatchlist(prisma, 'AAPL', 'Apple Inc.')
        await seedNewsArticles(prisma, 'AAPL', 3)

        // Finnhub fails → stale cache
        mockFinnhubGetCompanyNews.mockImplementation(async () => {
            throw new Error('Finnhub API error: 403 Forbidden')
        })

        const res = await jsonGet(app, '/api/stocks/AAPL/news?limit=5')
        const json = await res.json()

        // Should fall back to stale cache
        expect(res.status).toBe(200)
        expect(json.data.length).toBe(3)
    })

    // ─── All data sources fail ───

    it('returns appropriate errors when all sources fail', async () => {
        mockYahooQuote.mockImplementation(async () => {
            throw new Error('Yahoo down')
        })
        mockFinnhubGetCompanyNews.mockImplementation(async () => {
            throw new Error('Finnhub down')
        })

        // Watchlist should fail (can't get quotes)
        await seedWatchlist(prisma, 'AAPL', 'Apple Inc.')
        const wlRes = await jsonGet(app, '/api/watchlist')
        const wlJson = await wlRes.json()
        // watchlist uses Promise.allSettled, so it returns empty array
        expect(wlRes.status).toBe(200)
        expect(wlJson.data).toHaveLength(0)

        // News with no cache should fail
        const newsRes = await jsonGet(app, '/api/stocks/AAPL/news')
        expect(newsRes.status).toBe(500)
    })
})
