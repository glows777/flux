/**
 * P2: Concurrent Mutation E2E Test
 *
 * Tests race conditions with Promise.all() concurrent requests.
 */

import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { resetProviders } from '@/core/ai/providers'
import { prisma } from '@/core/db'
import { seedWatchlist, truncateAllTables } from '../helpers/db-utils'
import {
    mockGenerateText,
    mockYahooChart,
    mockYahooQuote,
    mockYahooQuoteSummary,
} from '../helpers/mock-boundaries'
import {
    createYahooChartResponse,
    createYahooQuoteResponse,
    createYahooQuoteSummaryResponse,
} from '../helpers/mock-data'
import {
    createTestApp,
    jsonDelete,
    jsonGet,
    jsonPost,
} from '../helpers/test-app'

const app = createTestApp()

describe('Concurrent Mutations (P2)', () => {
    beforeEach(async () => {
        await truncateAllTables(prisma)
        resetProviders()

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
        mockGenerateText.mockImplementation(async () => ({
            text: 'Report content',
        }))
    })

    afterAll(async () => {
        await truncateAllTables(prisma)
    })

    // ─── Concurrent add ───

    it('concurrent add: one succeeds (201), one fails (409)', async () => {
        const [res1, res2] = await Promise.all([
            jsonPost(app, '/api/watchlist', { symbol: 'AAPL' }),
            jsonPost(app, '/api/watchlist', { symbol: 'AAPL' }),
        ])

        const statuses = [res1.status, res2.status].sort()
        expect(statuses).toEqual([201, 409])

        // DB should have exactly 1 record
        const count = await prisma.watchlist.count({
            where: { symbol: 'AAPL' },
        })
        expect(count).toBe(1)
    })

    // ─── Concurrent delete ───

    it('concurrent delete: one succeeds (200), one fails (404)', async () => {
        await seedWatchlist(prisma, 'AAPL', 'Apple Inc.')

        const [res1, res2] = await Promise.all([
            jsonDelete(app, '/api/watchlist/AAPL'),
            jsonDelete(app, '/api/watchlist/AAPL'),
        ])

        const statuses = [res1.status, res2.status].sort()
        expect(statuses).toEqual([200, 404])
    })

    // ─── Read-write concurrent ───

    it('concurrent read+write: GET returns 0 or 1 items (no intermediate state)', async () => {
        const [getRes, _postRes] = await Promise.all([
            jsonGet(app, '/api/watchlist'),
            jsonPost(app, '/api/watchlist', { symbol: 'AAPL' }),
        ])

        const getJson = await getRes.json()
        expect(getRes.status).toBe(200)
        // GET should return 0 or 1 items (depending on timing)
        expect(getJson.data.length).toBeLessThanOrEqual(1)
        expect(getJson.data.length).toBeGreaterThanOrEqual(0)
    })

    // ─── Concurrent report generation ───

    it('concurrent report requests: both return 200', async () => {
        await seedWatchlist(prisma, 'AAPL', 'Apple Inc.')

        const [res1, res2] = await Promise.all([
            jsonPost(app, '/api/stocks/AAPL/report'),
            jsonPost(app, '/api/stocks/AAPL/report'),
        ])

        expect(res1.status).toBe(200)
        expect(res2.status).toBe(200)
    })

    // ─── Sync upsert race ───

    it('concurrent stock info requests: no unique constraint errors', async () => {
        await seedWatchlist(prisma, 'AAPL', 'Apple Inc.')

        const [res1, res2] = await Promise.all([
            jsonGet(app, '/api/stocks/AAPL/info'),
            jsonGet(app, '/api/stocks/AAPL/info'),
        ])

        expect(res1.status).toBe(200)
        expect(res2.status).toBe(200)
    })
})
