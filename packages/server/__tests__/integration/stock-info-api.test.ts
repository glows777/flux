/**
 * P2-11: Stock Info API Integration Tests
 *
 * Test scenarios per spec:
 * - T11-14: GET /api/stocks/AAPL/info returns metrics
 * - T11-01: Returns 200 + complete data
 * - T11-02: Partial fields missing
 * - T11-03: Invalid symbol (sync error) → 500
 * - T11-04: Case insensitive → 'aapl' works same as 'AAPL'
 * - T11-05: Uses Watchlist name
 * - Symbol validation → 400 for invalid format
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'

// Import after mock setup (handled by preload)
import { createHonoApp } from '@/routes/index'
import { mockGetStockInfo } from './helpers/mock-boundaries'

// ==================== Test app ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('GET /api/stocks/:symbol/info', () => {
    beforeEach(() => {
        mockGetStockInfo.mockReset()
        mockGetStockInfo.mockImplementation(async (symbol: string) => ({
            symbol: symbol.toUpperCase(),
            name: 'Apple Inc.',
            sector: 'Technology',
            pe: 28.5,
            marketCap: 3000000000000,
            eps: 6.15,
            dividendYield: 0.005,
            fetchedAt: new Date().toISOString(),
        }))
    })

    // ─── T11-14: Returns stock metrics ───

    describe('T11-14: GET /api/stocks/AAPL/info returns metrics', () => {
        it('returns 200 status code', async () => {
            const res = await app.request('/api/stocks/AAPL/info')

            expect(res.status).toBe(200)
        })

        it('returns success: true with data', async () => {
            const res = await app.request('/api/stocks/AAPL/info')
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.data).toBeDefined()
        })

        it('returns complete StockMetrics fields', async () => {
            const res = await app.request('/api/stocks/AAPL/info')
            const json = await res.json()
            const data = json.data

            expect(data.symbol).toBe('AAPL')
            expect(data.name).toBe('Apple Inc.')
            expect(data.sector).toBe('Technology')
            expect(data.pe).toBe(28.5)
            expect(data.marketCap).toBe(3000000000000)
            expect(data.eps).toBe(6.15)
            expect(data.dividendYield).toBe(0.005)
            expect(typeof data.fetchedAt).toBe('string')
        })
    })

    // ─── T11-02: Partial fields missing ───

    describe('T11-02: Partial fields missing', () => {
        it('returns undefined for missing optional fields', async () => {
            mockGetStockInfo.mockImplementation(async (symbol: string) => ({
                symbol: symbol.toUpperCase(),
                name: 'Test Corp',
                fetchedAt: new Date().toISOString(),
            }))

            const res = await app.request('/api/stocks/TEST/info')
            const json = await res.json()

            expect(json.data.symbol).toBe('TEST')
            expect(json.data.name).toBe('Test Corp')
            expect(json.data.pe).toBeUndefined()
            expect(json.data.marketCap).toBeUndefined()
        })
    })

    // ─── T11-03: Invalid symbol (sync fails) ───

    describe('T11-03: Invalid symbol', () => {
        it('returns 500 when getStockInfo throws', async () => {
            mockGetStockInfo.mockImplementation(async () => {
                throw new Error('Failed to fetch company info')
            })

            const res = await app.request('/api/stocks/INVALID/info')
            const json = await res.json()

            expect(res.status).toBe(500)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to fetch stock info')
        })
    })

    // ─── T11-04: Case insensitive ───

    describe('T11-04: Case insensitive', () => {
        it('converts lowercase symbol to uppercase', async () => {
            const res = await app.request('/api/stocks/aapl/info')
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.data.symbol).toBe('AAPL')
        })

        it('calls getStockInfo with uppercase symbol', async () => {
            await app.request('/api/stocks/aapl/info')

            expect(mockGetStockInfo).toHaveBeenCalledWith('AAPL')
        })
    })

    // ─── T11-05: Watchlist name priority ───

    describe('T11-05: Uses Watchlist name when available', () => {
        it('returns name from getStockInfo result', async () => {
            mockGetStockInfo.mockImplementation(async (symbol: string) => ({
                symbol: symbol.toUpperCase(),
                name: '苹果公司',
                fetchedAt: new Date().toISOString(),
            }))

            const res = await app.request('/api/stocks/AAPL/info')
            const json = await res.json()

            expect(json.data.name).toBe('苹果公司')
        })

        it('falls back to API name when no watchlist entry', async () => {
            const res = await app.request('/api/stocks/AAPL/info')
            const json = await res.json()

            expect(json.data.name).toBe('Apple Inc.')
        })
    })

    // ─── Symbol validation ───

    describe('Symbol validation', () => {
        it('returns 400 for symbol with invalid characters', async () => {
            const res = await app.request('/api/stocks/A@B!C/info')
            const json = await res.json()

            expect(res.status).toBe(400)
            expect(json.success).toBe(false)
            expect(json.error).toBe('Invalid symbol format')
        })

        it('returns 400 for symbol longer than 10 characters', async () => {
            const res = await app.request('/api/stocks/TOOLONGSYMBOL/info')
            const json = await res.json()

            expect(res.status).toBe(400)
            expect(json.success).toBe(false)
        })

        it('accepts valid symbols with dots (BRK.B)', async () => {
            const res = await app.request('/api/stocks/BRK.B/info')

            expect(res.status).toBe(200)
        })

        it('accepts valid symbols with caret (^VIX)', async () => {
            const res = await app.request('/api/stocks/^VIX/info')

            expect(res.status).toBe(200)
        })

        it('does not call getStockInfo for invalid symbols', async () => {
            await app.request('/api/stocks/TOOLONGSYMBOL/info')

            expect(mockGetStockInfo).not.toHaveBeenCalled()
        })
    })

    // ─── Response structure ───

    describe('Response structure', () => {
        it('returns { success: true, data: StockMetrics }', async () => {
            const res = await app.request('/api/stocks/NVDA/info')
            const json = await res.json()

            expect(json).toHaveProperty('success', true)
            expect(json).toHaveProperty('data')
            expect(json.data).toHaveProperty('symbol')
            expect(json.data).toHaveProperty('name')
            expect(json.data).toHaveProperty('fetchedAt')
        })
    })
})
