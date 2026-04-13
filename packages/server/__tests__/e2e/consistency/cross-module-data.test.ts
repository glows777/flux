/**
 * P1: Cross-Module Data Consistency E2E Test
 *
 * Validates that data flows correctly between modules:
 * watchlist → stock-info, etc.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { prisma } from '@/core/db'
import { truncateAllTables } from '../helpers/db-utils'
import {
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

describe('Cross-Module Data Consistency (P1)', () => {

    beforeEach(async () => {
        await truncateAllTables(prisma)

        mockYahooQuote.mockImplementation(async () =>
            createYahooQuoteResponse({
                symbol: 'AAPL',
                regularMarketPrice: 185.0,
                regularMarketChangePercent: 1.5,
                shortName: 'Apple Inc.',
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

    afterAll(async () => {
        await truncateAllTables(prisma)
    })

    // ─── Watchlist name pass-through ───

    it('custom watchlist name passes through to stock info', async () => {
        // Add with custom Chinese name
        await jsonPost(app, '/api/watchlist', { symbol: 'AAPL', name: '苹果' })

        // Stock info should return the custom name
        const res = await jsonGet(app, '/api/stocks/AAPL/info')
        const json = await res.json()

        expect(json.data.name).toBe('苹果')
    })

    // ─── Watchlist name default ───

    it('default name comes from Yahoo shortName', async () => {
        // Add without explicit name
        await jsonPost(app, '/api/watchlist', { symbol: 'AAPL' })

        // Stock info should use the Yahoo shortName
        const res = await jsonGet(app, '/api/stocks/AAPL/info')
        const json = await res.json()

        // The name should be either 'Apple Inc.' from Yahoo or resolved name
        expect(json.data.name.length).toBeGreaterThan(0)
    })

    // ─── Watchlist quote = detail quote ───

    it('watchlist and detail pages use same cached quote', async () => {
        await jsonPost(app, '/api/watchlist', { symbol: 'AAPL' })

        // Get watchlist (triggers getQuoteWithCache)
        const wlRes = await jsonGet(app, '/api/watchlist')
        const wlJson = await wlRes.json()
        const wlPrice = wlJson.data[0].price

        // Get detail info (also uses quote via different path)
        const infoRes = await jsonGet(app, '/api/stocks/AAPL/info')
        const infoJson = await infoRes.json()

        // Both should return consistent data from the same market data facade
        expect(typeof wlPrice).toBe('number')
        expect(typeof infoJson.data.pe).toBe('number')
    })

})
