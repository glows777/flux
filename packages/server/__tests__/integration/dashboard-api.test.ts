/**
 * Dashboard composite API integration test suite
 *
 * Test scenarios:
 * - GET /api/dashboard returns combined portfolio + watchlist + brief + positionSymbols
 * - Portfolio is built from Alpaca account + positions
 * - generateBrief receives prefetched data
 * - Error handling: graceful degradation on dependency failure
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import {
    mockGetAccount,
    mockGetPositions,
    mockGetMacroIndicators,
    mockGetWatchlistItems,
    mockGenerateBrief,
    mockGetInfoWithCache,
} from './helpers/mock-boundaries'

// Import after mock setup (handled by preload)
import { createHonoApp } from '@/routes/index'

// ==================== Mock data ====================

const mockAlpacaPosition = {
    symbol: 'AAPL',
    qty: 10,
    avgEntryPrice: 150,
    currentPrice: 180,
    marketValue: 1800,
    costBasis: 1500,
    unrealizedPl: 300,
    unrealizedPlPc: 20,
    changeToday: 0.012,
    lastdayPrice: 177.84,
}

const mockWatchlistData = [
    { id: 'AAPL', name: 'Apple Inc.', price: 180, chg: 1.2, data: [175, 178, 180] },
    { id: 'NVDA', name: 'NVIDIA', price: 900, chg: 2.5, data: [870, 885, 900] },
]

const mockMacroData = [
    { sym: '标普500', val: '5843', chg: '+0.7%', trend: 'up' },
    { sym: '恐慌指数', val: '15', chg: '-1.0%', trend: 'down' },
]

const mockBriefData = {
    generatedAt: '2026-03-02T01:00:00Z',
    macro: {
        summary: '标普500: 5843 (+0.7%)',
        signal: 'risk-on' as const,
        keyMetrics: [{ label: '标普500', value: '5843', change: '+0.7%' }],
    },
    spotlight: [],
    catalysts: [],
}

// ==================== Test app setup ====================

const app = createHonoApp()

// ==================== Tests ====================

describe('GET /api/dashboard', () => {
    beforeEach(() => {
        mockGetAccount.mockReset()
        mockGetPositions.mockReset()
        mockGetWatchlistItems.mockReset()
        mockGetMacroIndicators.mockReset()
        mockGenerateBrief.mockReset()
        mockGetInfoWithCache.mockReset()
    })

    describe('success response', () => {
        beforeEach(() => {
            mockGetAccount.mockImplementation(() =>
                Promise.resolve({
                    equity: 100000, cash: 50000, buyingPower: 100000,
                    lastEquity: 99500, longMarketValue: 50000,
                }),
            )
            mockGetPositions.mockImplementation(() =>
                Promise.resolve([mockAlpacaPosition]),
            )
            mockGetInfoWithCache.mockImplementation(async (symbol: string) => ({
                symbol,
                name: 'Apple Inc.',
                sector: 'Technology',
                pe: 28.5,
                marketCap: 2500000000000,
                eps: 6.5,
                dividendYield: 0.55,
            }))
            mockGetWatchlistItems.mockImplementation(() =>
                Promise.resolve(mockWatchlistData),
            )
            mockGetMacroIndicators.mockImplementation(() =>
                Promise.resolve(mockMacroData),
            )
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-03-02T01:00:00Z',
                }),
            )
        })

        it('returns 200 status code', async () => {
            const res = await app.request('/api/dashboard')
            expect(res.status).toBe(200)
        })

        it('returns success: true with combined data', async () => {
            const res = await app.request('/api/dashboard')
            const json = await res.json()

            expect(json.success).toBe(true)
            expect(json.data).toHaveProperty('portfolio')
            expect(json.data).toHaveProperty('watchlist')
            expect(json.data).toHaveProperty('brief')
            expect(json.data).toHaveProperty('positionSymbols')
        })

        it('returns portfolio built from Alpaca account and positions', async () => {
            const res = await app.request('/api/dashboard')
            const json = await res.json()

            expect(json.data.portfolio).not.toBeNull()
            expect(json.data.portfolio.holdings).toHaveLength(1)
            expect(json.data.portfolio.holdings[0].symbol).toBe('AAPL')
            expect(json.data.portfolio.holdings[0].shares).toBe(10)
            expect(json.data.portfolio.summary).toHaveProperty('totalValue')
            expect(json.data.portfolio.summary).toHaveProperty('vix')
        })

        it('returns watchlist data from getWatchlistItems', async () => {
            const res = await app.request('/api/dashboard')
            const json = await res.json()

            expect(json.data.watchlist).toEqual(mockWatchlistData)
        })

        it('returns brief data from generateBrief', async () => {
            const res = await app.request('/api/dashboard')
            const json = await res.json()

            expect(json.data.brief).toEqual(mockBriefData)
        })

        it('returns positionSymbols from Alpaca positions', async () => {
            const res = await app.request('/api/dashboard')
            const json = await res.json()

            expect(json.data.positionSymbols).toEqual(['AAPL'])
        })
    })

    describe('prefetched parameter passing', () => {
        beforeEach(() => {
            mockGetAccount.mockImplementation(() =>
                Promise.resolve({
                    equity: 100000, cash: 50000, buyingPower: 100000,
                    lastEquity: 99500, longMarketValue: 50000,
                }),
            )
            mockGetPositions.mockImplementation(() =>
                Promise.resolve([mockAlpacaPosition]),
            )
            mockGetInfoWithCache.mockImplementation(async (symbol: string) => ({
                symbol,
                name: 'Apple Inc.',
                sector: 'Technology',
                pe: 28.5,
                marketCap: 2500000000000,
                eps: 6.5,
                dividendYield: 0.55,
            }))
            mockGetWatchlistItems.mockImplementation(() =>
                Promise.resolve(mockWatchlistData),
            )
            mockGetMacroIndicators.mockImplementation(() =>
                Promise.resolve(mockMacroData),
            )
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-03-02T01:00:00Z',
                }),
            )
        })

        it('calls generateBrief with prefetched data', async () => {
            await app.request('/api/dashboard')

            expect(mockGenerateBrief).toHaveBeenCalledTimes(1)

            const args = mockGenerateBrief.mock.calls[0]
            // args: [forceRefresh, deps, now, prefetched]
            expect(args[0]).toBe(false) // forceRefresh
            expect(args[3]).toHaveProperty('portfolio')
            expect(args[3]).toHaveProperty('macro')
            expect(args[3]).toHaveProperty('watchlist')
        })
    })

    describe('partial failure (graceful degradation)', () => {
        it('returns null portfolio when Alpaca account fails', async () => {
            mockGetAccount.mockImplementation(() =>
                Promise.reject(new Error('Alpaca API down')),
            )
            mockGetPositions.mockImplementation(() =>
                Promise.resolve([]),
            )
            mockGetWatchlistItems.mockImplementation(() =>
                Promise.resolve(mockWatchlistData),
            )
            mockGetMacroIndicators.mockImplementation(() =>
                Promise.resolve(mockMacroData),
            )
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-03-02T01:00:00Z',
                }),
            )

            const res = await app.request('/api/dashboard')
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.success).toBe(true)
            expect(json.data.portfolio).toBeNull()
            expect(json.data.watchlist).toEqual(mockWatchlistData)
            expect(json.data.brief).toEqual(mockBriefData)
        })

        it('returns 200 with macro=null — brief still attempted', async () => {
            mockGetAccount.mockImplementation(() =>
                Promise.resolve({
                    equity: 100000, cash: 50000, buyingPower: 100000,
                    lastEquity: 99500, longMarketValue: 50000,
                }),
            )
            mockGetPositions.mockImplementation(() =>
                Promise.resolve([]),
            )
            mockGetWatchlistItems.mockImplementation(() =>
                Promise.resolve(mockWatchlistData),
            )
            mockGetMacroIndicators.mockImplementation(() =>
                Promise.reject(new Error('Macro API down')),
            )
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-03-02T01:00:00Z',
                }),
            )

            const res = await app.request('/api/dashboard')
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.success).toBe(true)
            expect(json.data.brief).toEqual(mockBriefData)
        })

        it('returns 200 with brief=null when generateBrief throws', async () => {
            mockGetAccount.mockImplementation(() =>
                Promise.resolve({
                    equity: 100000, cash: 50000, buyingPower: 100000,
                    lastEquity: 99500, longMarketValue: 50000,
                }),
            )
            mockGetPositions.mockImplementation(() =>
                Promise.resolve([]),
            )
            mockGetWatchlistItems.mockImplementation(() =>
                Promise.resolve(mockWatchlistData),
            )
            mockGetMacroIndicators.mockImplementation(() =>
                Promise.resolve(mockMacroData),
            )
            mockGenerateBrief.mockImplementation(() =>
                Promise.reject(new Error('AI service unavailable')),
            )

            const res = await app.request('/api/dashboard')
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.success).toBe(true)
            expect(json.data.brief).toBeNull()
        })

        it('omits failed source from prefetched (only passes successful data)', async () => {
            mockGetAccount.mockImplementation(() =>
                Promise.reject(new Error('Alpaca down')),
            )
            mockGetPositions.mockImplementation(() =>
                Promise.resolve([]),
            )
            mockGetWatchlistItems.mockImplementation(() =>
                Promise.resolve(mockWatchlistData),
            )
            mockGetMacroIndicators.mockImplementation(() =>
                Promise.resolve(mockMacroData),
            )
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-03-02T01:00:00Z',
                }),
            )

            await app.request('/api/dashboard')

            const args = mockGenerateBrief.mock.calls[0]
            const prefetched = args[3]
            // portfolio failed → not in prefetched, brief will fetch internally
            expect(prefetched).not.toHaveProperty('portfolio')
            expect(prefetched).toHaveProperty('macro')
            expect(prefetched).toHaveProperty('watchlist')
        })

        it('returns empty positionSymbols when positions fetch fails', async () => {
            mockGetAccount.mockImplementation(() =>
                Promise.resolve({
                    equity: 100000, cash: 50000, buyingPower: 100000,
                    lastEquity: 99500, longMarketValue: 50000,
                }),
            )
            mockGetPositions.mockImplementation(() =>
                Promise.reject(new Error('positions fetch failed')),
            )
            mockGetWatchlistItems.mockImplementation(() =>
                Promise.resolve([]),
            )
            mockGetMacroIndicators.mockImplementation(() =>
                Promise.resolve([]),
            )
            mockGenerateBrief.mockImplementation(() =>
                Promise.resolve({
                    data: mockBriefData,
                    cached: false,
                    generatedAt: '2026-03-02T01:00:00Z',
                }),
            )

            const res = await app.request('/api/dashboard')
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.data.positionSymbols).toEqual([])
        })
    })
})
