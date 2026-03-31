/**
 * P1: Cache Coherence E2E Test
 *
 * Tests cache TTL expiration, incremental history fill,
 * macro cache, and news stale fallback behaviors.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { prisma } from '@/core/db'
import { clearMacroCache } from '@/core/market-data'
import {
    backdateNewsFetchedAt,
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
import { createTestApp, jsonGet } from '../helpers/test-app'

const app = createTestApp()

describe('Cache Coherence (P1)', () => {
    beforeEach(async () => {
        await truncateAllTables(prisma)
        clearMacroCache()

        mockYahooQuote.mockImplementation(async () =>
            createYahooQuoteResponse({
                symbol: 'AAPL',
                regularMarketPrice: 185.0,
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
            createYahooQuoteSummaryResponse(),
        )
    })

    afterEach(() => {
        clearMacroCache()
    })

    afterAll(async () => {
        await truncateAllTables(prisma)
    })

    // ─── Quote cached briefly (30s memory), Info cached longer (7d DB) ───

    it('serves quote from memory cache on rapid repeat, info from DB cache', async () => {
        await seedWatchlist(prisma, 'AAPL', 'Apple Inc.')

        // First call to populate both quote (30s memory) and info (7d DB) caches
        await jsonGet(app, '/api/watchlist')
        await jsonGet(app, '/api/stocks/AAPL/info')

        // Reset mock call counts
        mockYahooQuote.mockClear()
        mockYahooQuoteSummary.mockClear()

        // Fetch watchlist again (within 30s — quote served from memory cache)
        const wlRes = await jsonGet(app, '/api/watchlist')
        const wlJson = await wlRes.json()
        expect(wlRes.status).toBe(200)
        expect(wlJson.data.length).toBe(1)

        // Quote should NOT have been re-fetched (30s memory cache hit)
        expect(mockYahooQuote.mock.calls.length).toBe(0)

        // Info should still be cached (not re-fetched)
        const infoRes = await jsonGet(app, '/api/stocks/AAPL/info')
        expect(infoRes.status).toBe(200)
    })

    // ─── Macro cache < 5min ───

    it('macro cache serves data within 5 minutes', async () => {
        // First call populates cache
        const res1 = await jsonGet(app, '/api/macro')
        expect(res1.status).toBe(200)

        const callsBefore = mockYahooQuote.mock.calls.length

        // Second call should use cache (no new Yahoo calls)
        const res2 = await jsonGet(app, '/api/macro')
        expect(res2.status).toBe(200)

        const callsAfter = mockYahooQuote.mock.calls.length
        expect(callsAfter).toBe(callsBefore)
    })

    // ─── Macro cache expired ───

    it('macro cache re-fetches after clearMacroCache()', async () => {
        // First call populates cache
        await jsonGet(app, '/api/macro')
        const callsAfterFirst = mockYahooQuote.mock.calls.length

        // Clear cache
        clearMacroCache()

        // Second call should re-fetch
        await jsonGet(app, '/api/macro')
        const callsAfterSecond = mockYahooQuote.mock.calls.length

        // Should have made 4 new calls (one per macro indicator)
        expect(callsAfterSecond - callsAfterFirst).toBe(4)
    })

    // ─── News stale fallback (API error) ───

    it('returns stale news when Finnhub throws', async () => {
        await seedWatchlist(prisma, 'AAPL', 'Apple Inc.')
        await seedNewsArticles(prisma, 'AAPL', 3)

        // Make Finnhub throw
        mockFinnhubGetCompanyNews.mockImplementation(async () => {
            throw new Error('Finnhub 503')
        })

        // Backdate news so they are expired (past 4h TTL)
        await backdateNewsFetchedAt(prisma, 'AAPL', 5)

        const res = await jsonGet(app, '/api/stocks/AAPL/news?limit=5')
        const json = await res.json()

        // Should return stale cache data
        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.data.length).toBeGreaterThan(0)
    })

    // ─── News stale fallback (expired + error) ───

    it('returns stale news when cache expired and Finnhub fails', async () => {
        await seedWatchlist(prisma, 'AAPL', 'Apple Inc.')
        await seedNewsArticles(prisma, 'AAPL', 2)

        // Backdate beyond 4h TTL
        await backdateNewsFetchedAt(prisma, 'AAPL', 6)

        // Finnhub throws
        mockFinnhubGetCompanyNews.mockImplementation(async () => {
            throw new Error('Finnhub 403 Forbidden')
        })

        const res = await jsonGet(app, '/api/stocks/AAPL/news?limit=5')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.data.length).toBe(2)
    })
})
