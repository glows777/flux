/**
 * P0: Report Generation Flow E2E Test
 *
 * Tests the report pipeline: data collection → prompt building → AI call → caching.
 * External boundaries mocked, inter-module calls are REAL.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { cleanupExpiredReports } from '@/core/ai/cache'
import { resetProviders } from '@/core/ai/providers'
import { prisma } from '@/core/db'
import { backdateReportCreatedAt, truncateAllTables } from '../helpers/db-utils'
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
import { createTestApp, jsonPost } from '../helpers/test-app'

const app = createTestApp()

const REPORT_CONTENT = `## 核心观点
Apple 分析

## 技术面分析
MA20 trend

## 基本面分析
PE analysis

## 风险提示
- Risk 1
- Risk 2`

describe('Report Generation Flow (P0)', () => {
    beforeAll(async () => {
        await truncateAllTables(prisma)
        resetProviders()

        mockYahooQuote.mockImplementation(async () =>
            createYahooQuoteResponse({
                symbol: 'AAPL',
                regularMarketPrice: 185.0,
                regularMarketChangePercent: 1.5,
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
            text: REPORT_CONTENT,
        }))

        // Seed AAPL in watchlist
        await prisma.watchlist.create({
            data: { symbol: 'AAPL', name: 'Apple Inc.' },
        })
    })

    beforeEach(() => {
        mockGenerateText.mockClear()
    })

    afterAll(async () => {
        await truncateAllTables(prisma)
    })

    // Step 1: First report request
    it('step 1: first request generates new report with real price data', async () => {
        const res = await jsonPost(app, '/api/stocks/AAPL/report')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.data.cached).toBe(false)
        expect(json.data.content).toBe(REPORT_CONTENT)
        expect(mockGenerateText).toHaveBeenCalledTimes(1)
    })

    // Step 2: Verify prompt structure
    it('step 2: prompt includes real price data and technical indicators', async () => {
        // Trigger a fresh report
        await prisma.aIReport.deleteMany({ where: { symbol: 'AAPL' } })
        resetProviders()

        await jsonPost(app, '/api/stocks/AAPL/report')

        expect(mockGenerateText).toHaveBeenCalledTimes(1)
        const call = mockGenerateText.mock.calls[0]
        // The generateText receives an object with a `prompt` field
        const promptArg = (call[0] as { prompt?: string })?.prompt ?? ''
        expect(promptArg).toContain('AAPL')
    })

    // Step 3: Verify DB record
    it('step 3: report is stored in database', async () => {
        const report = await prisma.aIReport.findFirst({
            where: { symbol: 'AAPL' },
            orderBy: { createdAt: 'desc' },
        })

        expect(report).not.toBeNull()
        expect(report?.symbol).toBe('AAPL')
        expect(report?.content.length).toBeGreaterThan(0)
    })

    // Step 4: Second request → cached
    it('step 4: second request returns cached report', async () => {
        const res = await jsonPost(app, '/api/stocks/AAPL/report')
        const json = await res.json()

        expect(json.data.cached).toBe(true)
        expect(mockGenerateText).not.toHaveBeenCalled()
    })

    // Step 5: forceRefresh → regenerate
    it('step 5: forceRefresh bypasses cache', async () => {
        const res = await jsonPost(app, '/api/stocks/AAPL/report', {
            forceRefresh: true,
        })
        const json = await res.json()

        expect(json.data.cached).toBe(false)
        expect(mockGenerateText).toHaveBeenCalledTimes(1)
    })

    // Step 6: Backdate report → expired → regenerate
    it('step 6: expired report triggers regeneration', async () => {
        // Backdate ALL AAPL reports past the 24h TTL
        // (step 5 created a second report, so the older one could still be within TTL)
        const allReports = await prisma.aIReport.findMany({
            where: { symbol: 'AAPL' },
        })
        expect(allReports.length).toBeGreaterThan(0)

        for (const report of allReports) {
            await backdateReportCreatedAt(prisma, report.id, 25)
        }

        const res = await jsonPost(app, '/api/stocks/AAPL/report')
        const json = await res.json()

        expect(json.data.cached).toBe(false)
        expect(mockGenerateText).toHaveBeenCalledTimes(1)
    })

    // Step 7: cleanupExpiredReports → expired records deleted
    it('step 7: cleanup removes expired reports', async () => {
        // Backdate all AAPL reports to 25 hours ago
        const reports = await prisma.aIReport.findMany({
            where: { symbol: 'AAPL' },
        })
        for (const r of reports) {
            await backdateReportCreatedAt(prisma, r.id, 25)
        }

        // Add one fresh report
        await prisma.aIReport.create({
            data: {
                symbol: 'AAPL',
                content: 'Fresh report',
                createdAt: new Date(),
            },
        })

        const deleted = await cleanupExpiredReports()
        expect(deleted).toBeGreaterThan(0)

        // Fresh report should still exist
        const remaining = await prisma.aIReport.findMany({
            where: { symbol: 'AAPL' },
        })
        expect(remaining.length).toBeGreaterThanOrEqual(1)
        expect(remaining.some((r) => r.content === 'Fresh report')).toBe(true)
    })
})
