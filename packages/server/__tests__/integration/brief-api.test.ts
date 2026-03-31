/**
 * Brief API integration test suite
 *
 * Test scenarios from spec Task 07:
 * - GET /api/brief returns cached brief
 * - GET /api/brief returns freshly generated brief
 * - POST /api/brief forces refresh (cached: false)
 * - GET /api/brief returns 500 on error
 * - POST /api/brief returns 500 on error
 * - Response format validation (success/data/cached/generatedAt)
 * - GET idempotency (consecutive calls return same result)
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import { mockGenerateBrief } from './helpers/mock-boundaries'

// Import after mock setup (handled by preload)
import { createHonoApp } from '@/routes/index'

// ==================== Mock data ====================

const mockBriefData = {
    generatedAt: '2026-02-28T01:00:00Z',
    macro: {
        summary: '标普500: 498.20 (+1.2%)',
        signal: 'risk-on' as const,
        keyMetrics: [{ label: '标普500', value: '498.20', change: '+1.2%' }],
    },
    spotlight: [],
    catalysts: [],
}

// ==================== Test app setup ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('GET /api/brief', () => {
    beforeEach(() => {
        mockGenerateBrief.mockReset()
    })

    describe('returns cached brief', () => {
        it('returns 200 status code', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: true,
                    generatedAt: '2026-02-28T01:00:00Z',
                }),
            )

            const res = await app.request('/api/brief')

            expect(res.status).toBe(200)
        })

        it('returns success: true with cached: true', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: true,
                    generatedAt: '2026-02-28T01:00:00Z',
                }),
            )

            const res = await app.request('/api/brief')
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.cached).toBe(true)
        })

        it('calls generateBrief with forceRefresh=false', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: true,
                    generatedAt: '2026-02-28T01:00:00Z',
                }),
            )

            await app.request('/api/brief')

            expect(mockGenerateBrief).toHaveBeenCalledWith(false)
        })
    })

    describe('returns freshly generated brief', () => {
        it('returns cached: false when no cache exists', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-02-28T02:00:00Z',
                }),
            )

            const res = await app.request('/api/brief')
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.cached).toBe(false)
        })
    })

    describe('error handling', () => {
        it('returns 500 when generateBrief throws', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.reject(new Error('AI service unavailable')),
            )

            const res = await app.request('/api/brief')
            const json = await res.json()

            expect(res.status).toBe(500)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to generate brief')
        })
    })

    describe('response format', () => {
        it('contains success, data, cached, generatedAt fields', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: true,
                    generatedAt: '2026-02-28T01:00:00Z',
                }),
            )

            const res = await app.request('/api/brief')
            const json = await res.json()

            expect(json).toHaveProperty('success')
            expect(json).toHaveProperty('data')
            expect(json).toHaveProperty('cached')
            expect(json).toHaveProperty('generatedAt')
        })

        it('data contains MorningBrief structure', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: true,
                    generatedAt: '2026-02-28T01:00:00Z',
                }),
            )

            const res = await app.request('/api/brief')
            const json = await res.json()

            expect(json.data).toHaveProperty('generatedAt')
            expect(json.data).toHaveProperty('macro')
            expect(json.data).toHaveProperty('spotlight')
            expect(json.data).toHaveProperty('catalysts')
        })
    })

    describe('idempotency', () => {
        it('returns same result on consecutive calls (cache hit)', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: true,
                    generatedAt: '2026-02-28T01:00:00Z',
                }),
            )

            const res1 = await app.request('/api/brief')
            const json1 = await res1.json()

            const res2 = await app.request('/api/brief')
            const json2 = await res2.json()

            expect(json1).toEqual(json2)
        })

        it('calls generateBrief(false) each time', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: true,
                    generatedAt: '2026-02-28T01:00:00Z',
                }),
            )

            await app.request('/api/brief')
            await app.request('/api/brief')

            expect(mockGenerateBrief).toHaveBeenCalledTimes(2)
            expect(mockGenerateBrief).toHaveBeenCalledWith(false)
        })
    })
})

describe('POST /api/brief', () => {
    beforeEach(() => {
        mockGenerateBrief.mockReset()
    })

    describe('force refresh', () => {
        it('returns 200 status code', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-02-28T02:00:00Z',
                }),
            )

            const res = await app.request('/api/brief', { method: 'POST' })

            expect(res.status).toBe(200)
        })

        it('returns cached: false always', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-02-28T02:00:00Z',
                }),
            )

            const res = await app.request('/api/brief', { method: 'POST' })
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.cached).toBe(false)
        })

        it('calls generateBrief with forceRefresh=true', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-02-28T02:00:00Z',
                }),
            )

            await app.request('/api/brief', { method: 'POST' })

            expect(mockGenerateBrief).toHaveBeenCalledWith(true)
        })
    })

    describe('error handling', () => {
        it('returns 500 when generateBrief throws', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.reject(new Error('AI service unavailable')),
            )

            const res = await app.request('/api/brief', { method: 'POST' })
            const json = await res.json()

            expect(res.status).toBe(500)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to generate brief')
        })
    })

    describe('response format', () => {
        it('contains success, data, cached, generatedAt fields', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-02-28T02:00:00Z',
                }),
            )

            const res = await app.request('/api/brief', { method: 'POST' })
            const json = await res.json()

            expect(json).toHaveProperty('success')
            expect(json).toHaveProperty('data')
            expect(json).toHaveProperty('cached')
            expect(json).toHaveProperty('generatedAt')
        })
    })

    describe('always regenerates', () => {
        it('calls generateBrief(true) on every POST', async () => {
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-02-28T02:00:00Z',
                }),
            )

            await app.request('/api/brief', { method: 'POST' })
            await app.request('/api/brief', { method: 'POST' })

            expect(mockGenerateBrief).toHaveBeenCalledTimes(2)
            expect(mockGenerateBrief.mock.calls[0]).toEqual([true])
            expect(mockGenerateBrief.mock.calls[1]).toEqual([true])
        })
    })
})
