/**
 * Position API integration test suite
 *
 * Test scenarios:
 * - GET /api/stocks/:symbol/position returns holding item when position exists
 * - Returns null when no position held
 * - Returns null when Alpaca fails
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import { mockGetPosition } from './helpers/mock-boundaries'

// Import after mock setup (handled by preload)
import { createHonoApp } from '@/routes/index'

const app = createHonoApp()

describe('GET /api/stocks/:symbol/position', () => {
    beforeEach(() => {
        mockGetPosition.mockReset()
    })

    it('returns holding item when position exists', async () => {
        mockGetPosition.mockResolvedValueOnce({
            symbol: 'AAPL',
            qty: 10,
            avgEntryPrice: 150,
            currentPrice: 160,
            marketValue: 1600,
            costBasis: 1500,
            unrealizedPl: 100,
            unrealizedPlPc: 6.67,
            changeToday: 1.5,
            lastdayPrice: 157.6,
        })

        const res = await app.request('/api/stocks/AAPL/position')
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.data.symbol).toBe('AAPL')
        expect(json.data.shares).toBe(10)
    })

    it('returns null when no position', async () => {
        mockGetPosition.mockResolvedValueOnce(null)

        const res = await app.request('/api/stocks/AAPL/position')
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.data).toBeNull()
    })

    it('returns null when Alpaca fails', async () => {
        mockGetPosition.mockRejectedValueOnce(new Error('network'))

        const res = await app.request('/api/stocks/AAPL/position')
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.data).toBeNull()
    })
})
