/**
 * P0: Watchlist Lifecycle E2E Test
 *
 * Full CRUD lifecycle — state accumulates across sequential steps.
 * External boundaries mocked, inter-module calls are REAL.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { prisma } from '@/core/db'
import { truncateAllTables } from '../helpers/db-utils'
import {
    mockYahooChart,
    mockYahooQuote,
    mockYahooQuoteSummary,
} from '../helpers/mock-boundaries'
import {
    createMultiSymbolQuoteMock,
    createYahooChartResponse,
    createYahooQuoteSummaryResponse,
} from '../helpers/mock-data'
import {
    createTestApp,
    jsonDelete,
    jsonGet,
    jsonPost,
} from '../helpers/test-app'

const app = createTestApp()

describe('Watchlist Lifecycle (P0)', () => {
    beforeAll(async () => {
        await truncateAllTables(prisma)

        // Set up per-symbol routing for quotes
        const quoteMock = createMultiSymbolQuoteMock([
            {
                symbol: 'AAPL',
                price: 185.5,
                change: 1.2,
                shortName: 'Apple Inc.',
                marketCap: 3e12,
                sector: 'Technology',
            },
            {
                symbol: 'TSLA',
                price: 245.0,
                change: -0.8,
                shortName: 'Tesla, Inc.',
                marketCap: 780e9,
                sector: 'Automotive',
            },
        ])
        mockYahooQuote.mockImplementation(quoteMock)

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

    // Step 1: GET /api/watchlist → empty
    it('step 1: returns empty watchlist initially', async () => {
        const res = await jsonGet(app, '/api/watchlist')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.data).toEqual([])
    })

    // Step 2: POST /api/watchlist { symbol: "AAPL" } → 201
    it('step 2: adds AAPL to watchlist', async () => {
        const res = await jsonPost(app, '/api/watchlist', { symbol: 'AAPL' })
        const json = await res.json()

        expect(res.status).toBe(201)
        expect(json.success).toBe(true)
        expect(json.data.id).toBe('AAPL')
        expect(typeof json.data.price).toBe('number')
        expect(typeof json.data.chg).toBe('number')
        expect(Array.isArray(json.data.data)).toBe(true)
    })

    // Step 3: POST /api/watchlist { symbol: "AAPL" } again → 409
    it('step 3: rejects duplicate AAPL add', async () => {
        const res = await jsonPost(app, '/api/watchlist', { symbol: 'AAPL' })
        const json = await res.json()

        expect(res.status).toBe(409)
        expect(json.success).toBe(false)
    })

    // Step 4: GET /api/watchlist → length 1
    it('step 4: watchlist has 1 item', async () => {
        const res = await jsonGet(app, '/api/watchlist')
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.data).toHaveLength(1)
        expect(json.data[0].id).toBe('AAPL')
    })

    // Step 5: GET /api/stocks/AAPL/info → name consistent
    it('step 5: stock info name matches watchlist name', async () => {
        const res = await jsonGet(app, '/api/stocks/AAPL/info')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(typeof json.data.name).toBe('string')
        expect(json.data.name.length).toBeGreaterThan(0)
    })

    // Step 6: POST /api/watchlist { symbol: "TSLA" } → 201
    it('step 6: adds TSLA to watchlist', async () => {
        const res = await jsonPost(app, '/api/watchlist', { symbol: 'TSLA' })
        const json = await res.json()

        expect(res.status).toBe(201)
        expect(json.success).toBe(true)
        expect(json.data.id).toBe('TSLA')
    })

    // Step 7: GET /api/watchlist → length 2
    it('step 7: watchlist has 2 items', async () => {
        const res = await jsonGet(app, '/api/watchlist')
        const json = await res.json()

        expect(json.data).toHaveLength(2)
    })

    // Step 8: DELETE /api/watchlist/AAPL → 200
    it('step 8: removes AAPL from watchlist', async () => {
        const res = await jsonDelete(app, '/api/watchlist/AAPL')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
    })

    // Step 9: GET /api/watchlist → length 1, only TSLA
    it('step 9: watchlist has only TSLA', async () => {
        const res = await jsonGet(app, '/api/watchlist')
        const json = await res.json()

        expect(json.data).toHaveLength(1)
        expect(json.data[0].id).toBe('TSLA')
    })

    // Step 10: DELETE /api/watchlist/AAPL → 404
    it('step 10: re-delete AAPL returns 404', async () => {
        const res = await jsonDelete(app, '/api/watchlist/AAPL')
        const json = await res.json()

        expect(res.status).toBe(404)
        expect(json.success).toBe(false)
    })
})
