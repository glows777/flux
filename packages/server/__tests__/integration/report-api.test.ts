/**
 * P2-14 / P2-15: Report API Integration Tests
 *
 * Test scenarios:
 * - T14-10: POST /api/stocks/AAPL/report - 返回 200 + 研报内容
 * - T14-11: 研报结构 - 包含核心观点、技术面、基本面、风险
 * - T15-09: 首次请求 - 返回新生成的研报
 * - T15-10: 第二次请求 - 返回缓存研报
 * - T15-11: forceRefresh 请求 - 返回新研报，cached: false
 * - Invalid symbol format - 400
 * - Server error - 500
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import { mockGetReportWithCache } from './helpers/mock-boundaries'

import { createHonoApp } from '@/routes/index'

// ==================== Mock data ====================

const MOCK_REPORT_CONTENT = `## 核心观点
Apple 股票当前处于上升趋势...

## 技术面分析
MA20 显示...

## 基本面分析
市盈率合理...

## 风险提示
- 风险1
- 风险2
`

// ==================== Test app ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('POST /api/stocks/:symbol/report', () => {
    beforeEach(() => {
        mockGetReportWithCache.mockReset()

        // Default: generate new report
        mockGetReportWithCache.mockImplementation(async (symbol: string) => ({
            symbol: symbol.toUpperCase(),
            content: MOCK_REPORT_CONTENT,
            createdAt: new Date(),
            cached: false,
        }))
    })

    // ─── T14-10: 正常返回 ───

    describe('T14-10: Normal response', () => {
        it('returns 200 status code', async () => {
            const res = await app.request('/api/stocks/AAPL/report', {
                method: 'POST',
            })

            expect(res.status).toBe(200)
        })

        it('returns success: true with data', async () => {
            const res = await app.request('/api/stocks/AAPL/report', {
                method: 'POST',
            })
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.data).toBeDefined()
            expect(json.data.symbol).toBe('AAPL')
            expect(json.data.content).toBe(MOCK_REPORT_CONTENT)
            expect(json.data.createdAt).toBeDefined()
            expect(typeof json.data.cached).toBe('boolean')
        })
    })

    // ─── T14-11: 研报结构 ───

    describe('T14-11: Report structure', () => {
        it('report content contains required sections', async () => {
            const res = await app.request('/api/stocks/AAPL/report', {
                method: 'POST',
            })
            const json = await res.json()

            expect(json.data.content).toContain('核心观点')
            expect(json.data.content).toContain('技术面分析')
            expect(json.data.content).toContain('基本面分析')
            expect(json.data.content).toContain('风险提示')
        })
    })

    // ─── T15-09: 首次请求 ───

    describe('T15-09: First request', () => {
        it('returns newly generated report with cached: false', async () => {
            const res = await app.request('/api/stocks/AAPL/report', {
                method: 'POST',
            })
            const json = await res.json()

            expect(json.data.cached).toBe(false)
        })
    })

    // ─── T15-10: 第二次请求 (缓存) ───

    describe('T15-10: Cached request', () => {
        it('returns cached report with cached: true', async () => {
            mockGetReportWithCache.mockImplementation(async (symbol: string) => ({
                symbol: symbol.toUpperCase(),
                content: 'Cached content',
                createdAt: new Date(),
                cached: true,
            }))

            const res = await app.request('/api/stocks/AAPL/report', {
                method: 'POST',
            })
            const json = await res.json()

            expect(json.data.cached).toBe(true)
            expect(json.data.content).toBe('Cached content')
        })
    })

    // ─── T15-11: forceRefresh ───

    describe('T15-11: Force refresh request', () => {
        it('generates new report when forced', async () => {
            const res = await app.request('/api/stocks/AAPL/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ forceRefresh: true }),
            })
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.data.cached).toBe(false)
        })

        it('passes forceRefresh to getReportWithCache', async () => {
            await app.request('/api/stocks/AAPL/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ forceRefresh: true }),
            })

            expect(mockGetReportWithCache).toHaveBeenCalledWith('AAPL', true)
        })
    })

    // ─── Symbol validation ───

    describe('Symbol validation', () => {
        it('returns 400 for invalid symbol format', async () => {
            const res = await app.request('/api/stocks/invalid!!!/report', {
                method: 'POST',
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
            expect(json.error).toContain('Invalid symbol')
        })
    })

    // ─── Error handling ───

    describe('Error handling', () => {
        it('returns 500 when report generation fails', async () => {
            mockGetReportWithCache.mockImplementation(() =>
                Promise.reject(new Error('AI generation failed')),
            )

            const res = await app.request('/api/stocks/AAPL/report', {
                method: 'POST',
            })

            expect(res.status).toBe(500)
            const json = await res.json()
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to generate report')
        })
    })

    // ─── Auto uppercase ───

    describe('Auto uppercase', () => {
        it('converts lowercase symbol to uppercase', async () => {
            const res = await app.request('/api/stocks/aapl/report', {
                method: 'POST',
            })
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.data.symbol).toBe('AAPL')
        })
    })

    // ─── No body ───

    describe('No request body', () => {
        it('works without a request body', async () => {
            const res = await app.request('/api/stocks/AAPL/report', {
                method: 'POST',
            })

            expect(res.status).toBe(200)
        })
    })
})
