/**
 * P3: Partial Failure E2E Test
 *
 * Tests graceful degradation when some data sources fail.
 */

import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { prisma } from '@/core/db'
import { clearMacroCache } from '@/core/market-data'
import { seedWatchlist, truncateAllTables } from '../helpers/db-utils'
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
import { createTestApp, jsonGet } from '../helpers/test-app'

const app = createTestApp()

describe('Partial Failure (P3)', () => {
    beforeEach(async () => {
        await truncateAllTables(prisma)
        clearMacroCache()
    })

    afterAll(async () => {
        await truncateAllTables(prisma)
    })

    // ─── 1/5 quote fails → watchlist returns partial results ───

    it('returns partial watchlist when 1 of 5 quotes fails', async () => {
        const symbols = ['AAPL', 'TSLA', 'AMD', 'COIN', 'PLTR']
        for (const s of symbols) {
            await seedWatchlist(prisma, s, s)
        }

        // COIN quote throws, others succeed
        mockYahooQuote.mockImplementation(async (symbol: string) => {
            if (symbol === 'COIN') {
                throw new Error('Yahoo timeout for COIN')
            }
            return createYahooQuoteResponse({
                symbol,
                regularMarketPrice: 100,
                regularMarketChangePercent: 0.5,
                shortName: symbol,
            })
        })

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

        const res = await jsonGet(app, '/api/watchlist')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        // Should return 4 items (COIN failed)
        expect(json.data.length).toBe(4)
        const returnedIds = json.data.map((d: { id: string }) => d.id)
        expect(returnedIds).not.toContain('COIN')
    })

    // ─── 2/4 macro timeout → placeholder values ───

    it('returns placeholder values for failed macro indicators', async () => {
        let callCount = 0
        mockYahooQuote.mockImplementation(async (symbol: string) => {
            callCount++
            // First 2 calls (SPY, QQQ) throw, last 2 succeed
            if (callCount <= 2) {
                throw new Error(`Timeout for ${symbol}`)
            }
            return {
                regularMarketPrice: 4.1,
                regularMarketChangePercent: -0.5,
            }
        })

        const res = await jsonGet(app, '/api/macro')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.data).toHaveLength(4)

        // First 2 should be placeholders
        expect(json.data[0].val).toBe('--')
        expect(json.data[1].val).toBe('--')

        // Last 2 should have real values
        expect(json.data[2].val).not.toBe('--')
        expect(json.data[3].val).not.toBe('--')
    })

    // ─── Partial info fields ───

    it('handles missing dividendYield gracefully', async () => {
        await seedWatchlist(prisma, 'AAPL', 'Apple Inc.')

        mockYahooQuote.mockImplementation(async () =>
            createYahooQuoteResponse({ symbol: 'AAPL' }),
        )
        mockYahooQuoteSummary.mockImplementation(async () => ({
            summaryDetail: {
                trailingPE: 28.5,
                // No dividendYield
            },
            defaultKeyStatistics: {
                trailingEps: 6.15,
            },
        }))

        const res = await jsonGet(app, '/api/stocks/AAPL/info')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.data.pe).toBe(28.5)
        expect(json.data.eps).toBe(6.15)
        // dividendYield should be null/undefined when missing
        expect(json.data.dividendYield == null).toBe(true)
    })
})
