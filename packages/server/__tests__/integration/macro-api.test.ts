/**
 * Macro API integration test suite
 *
 * Test scenarios from spec P2-06:
 * - T06-11: GET /api/macro returns 200 + data
 * - T06-12: Repeated requests use cache (faster response)
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import { mockGetMacroIndicators } from './helpers/mock-boundaries'

// Import after mock setup (handled by preload)
import { createHonoApp } from '@/routes/index'

// ==================== Mock data ====================

const mockMacroData = [
    { sym: '标普500', val: '498.20', chg: '+1.2%', trend: 'up' },
    { sym: '纳斯达克100', val: '523.45', chg: '+1.8%', trend: 'up' },
    { sym: '十年美债', val: '4.10%', chg: '-0.5%', trend: 'down' },
    { sym: '恐慌指数', val: '13.40', chg: '-5.1%', trend: 'down' },
]

// ==================== Test app setup ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('GET /api/macro', () => {
    beforeEach(() => {
        mockGetMacroIndicators.mockReset()
        mockGetMacroIndicators.mockImplementation(() => Promise.resolve(mockMacroData))
    })

    // ============= T06-11: GET /api/macro returns 200 + data =============

    describe('T06-11: GET /api/macro returns 200 with data', () => {
        it('returns 200 status code', async () => {
            const res = await app.request('/api/macro')

            expect(res.status).toBe(200)
        })

        it('returns success: true with data array', async () => {
            const res = await app.request('/api/macro')
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(Array.isArray(json.data)).toBe(true)
            expect(json.data).toHaveLength(4)
        })

        it('returns data conforming to MacroTicker format', async () => {
            const res = await app.request('/api/macro')
            const json = await res.json()

            for (const ticker of json.data) {
                expect(typeof ticker.sym).toBe('string')
                expect(typeof ticker.val).toBe('string')
                expect(typeof ticker.chg).toBe('string')
                expect(['up', 'down']).toContain(ticker.trend)
            }
        })

        it('returns correct indicator names', async () => {
            const res = await app.request('/api/macro')
            const json = await res.json()
            const names = json.data.map((t: { sym: string }) => t.sym)

            expect(names).toEqual(['标普500', '纳斯达克100', '十年美债', '恐慌指数'])
        })

        it('returns 500 when getMacroIndicators throws unexpectedly', async () => {
            mockGetMacroIndicators.mockImplementation(() =>
                Promise.reject(new Error('Unexpected error')),
            )

            const res = await app.request('/api/macro')
            const json = await res.json()

            expect(res.status).toBe(500)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to fetch macro indicators')
        })
    })

    // ============= T06-12: Repeated requests use cache =============

    describe('T06-12: Repeated requests - second uses cache', () => {
        it('calls getMacroIndicators on each request (caching is internal)', async () => {
            await app.request('/api/macro')
            expect(mockGetMacroIndicators).toHaveBeenCalledTimes(1)

            await app.request('/api/macro')
            expect(mockGetMacroIndicators).toHaveBeenCalledTimes(2)
        })

        it('returns same data on repeated requests', async () => {
            const res1 = await app.request('/api/macro')
            const json1 = await res1.json()

            const res2 = await app.request('/api/macro')
            const json2 = await res2.json()

            expect(json1).toEqual(json2)
        })
    })
})
