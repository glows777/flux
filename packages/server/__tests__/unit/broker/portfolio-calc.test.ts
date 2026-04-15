import { describe, expect, it } from 'bun:test'
import type { HoldingItem } from '@flux/shared'
import {
    calculateSummary,
    mapAlpacaPositionToHoldingItem,
} from '../../../src/core/broker/portfolio-calc'

// Minimal inline type alias so tests compile even if alpaca-client.ts
// doesn't exist yet (Task 1 runs in parallel).
type AlpacaPosition = {
    readonly symbol: string
    readonly qty: number
    readonly avgEntryPrice: number
    readonly currentPrice: number
    readonly marketValue: number
    readonly costBasis: number
    readonly unrealizedPl: number
    readonly unrealizedPlPc: number
    readonly changeToday: number
    readonly lastdayPrice: number
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makePosition = (
    overrides: Partial<AlpacaPosition> = {},
): AlpacaPosition => ({
    symbol: 'AAPL',
    qty: 10,
    avgEntryPrice: 150,
    currentPrice: 160,
    marketValue: 1600,
    costBasis: 1500,
    unrealizedPl: 100,
    unrealizedPlPc: 6.67,
    changeToday: 0.02,
    lastdayPrice: 156.86,
    ...overrides,
})

const makeHoldingItem = (
    overrides: Partial<HoldingItem> = {},
): HoldingItem => ({
    symbol: 'AAPL',
    name: 'Apple Inc.',
    shares: 10,
    avgCost: 150,
    currentPrice: 160,
    dailyChange: 0.02,
    totalPnL: 100,
    dailyPnL: 31.4,
    ...overrides,
})

// ─── mapAlpacaPositionToHoldingItem ─────────────────────────────────────────

describe('mapAlpacaPositionToHoldingItem', () => {
    it('maps all fields correctly', () => {
        const position = makePosition()
        const result = mapAlpacaPositionToHoldingItem(position, 'Apple Inc.')

        expect(result.symbol).toBe('AAPL')
        expect(result.name).toBe('Apple Inc.')
        expect(result.shares).toBe(10)
        expect(result.avgCost).toBe(150)
        expect(result.currentPrice).toBe(160)
        expect(result.dailyChange).toBe(0.02)
        // totalPnL: use Alpaca's unrealizedPl directly
        expect(result.totalPnL).toBe(100)
        // dailyPnL: qty × (currentPrice - lastdayPrice) = 10 × (160 - 156.86) = 31.4
        expect(result.dailyPnL).toBeCloseTo(31.4, 5)
    })

    it('passes null name through', () => {
        const position = makePosition({ symbol: 'XYZ' })
        const result = mapAlpacaPositionToHoldingItem(position, null)

        expect(result.name).toBeNull()
        expect(result.symbol).toBe('XYZ')
    })

    it('computes dailyPnL as qty × (currentPrice - lastdayPrice)', () => {
        // qty=5, currentPrice=200, lastdayPrice=190 → dailyPnL=50
        const position = makePosition({
            qty: 5,
            currentPrice: 200,
            lastdayPrice: 190,
        })
        const result = mapAlpacaPositionToHoldingItem(position, null)
        expect(result.dailyPnL).toBeCloseTo(50, 5)
    })
})

// ─── calculateSummary ────────────────────────────────────────────────────────

describe('calculateSummary', () => {
    it('returns zero values and null topContributor for empty array', () => {
        const summary = calculateSummary([], 20)

        expect(summary.totalValue).toBe(0)
        expect(summary.totalCost).toBe(0)
        expect(summary.totalPnL).toBe(0)
        expect(summary.totalPnLPercent).toBe(0)
        expect(summary.todayPnL).toBe(0)
        expect(summary.todayPnLPercent).toBe(0)
        expect(summary.topContributor).toBeNull()
        expect(summary.vix).toBe(20)
    })

    it('calculates correct values for a single holding', () => {
        // shares=10, avgCost=150, currentPrice=160, dailyPnL=31.4, totalPnL=100
        const item = makeHoldingItem()
        const summary = calculateSummary([item], 18.5)

        expect(summary.totalValue).toBeCloseTo(1600, 5) // 10 × 160
        expect(summary.totalCost).toBeCloseTo(1500, 5) // 10 × 150
        expect(summary.totalPnL).toBeCloseTo(100, 5) // from item.totalPnL
        expect(summary.totalPnLPercent).toBeCloseTo((100 / 1500) * 100, 5)
        expect(summary.todayPnL).toBeCloseTo(31.4, 5)
        // yesterdayTotalValue = 1600 - 31.4 = 1568.6
        expect(summary.todayPnLPercent).toBeCloseTo((31.4 / 1568.6) * 100, 5)
        expect(summary.vix).toBe(18.5)
        expect(summary.topContributor).not.toBeNull()
        expect(summary.topContributor?.symbol).toBe('AAPL')
        expect(summary.topContributor?.name).toBe('Apple Inc.')
        expect(summary.topContributor?.dailyPnL).toBeCloseTo(31.4, 5)
    })

    it('aggregates multiple items and selects topContributor by max |dailyPnL|', () => {
        const item1 = makeHoldingItem({
            symbol: 'AAPL',
            name: 'Apple Inc.',
            shares: 10,
            avgCost: 150,
            currentPrice: 160,
            dailyPnL: 31.4,
            totalPnL: 100,
        })
        const item2 = makeHoldingItem({
            symbol: 'MSFT',
            name: 'Microsoft',
            shares: 5,
            avgCost: 300,
            currentPrice: 290,
            dailyPnL: -60, // larger absolute value
            totalPnL: -50,
        })

        const summary = calculateSummary([item1, item2], 22)

        // totalValue = 10×160 + 5×290 = 1600 + 1450 = 3050
        expect(summary.totalValue).toBeCloseTo(3050, 5)
        // totalCost = 10×150 + 5×300 = 1500 + 1500 = 3000
        expect(summary.totalCost).toBeCloseTo(3000, 5)
        // totalPnL = 100 + (-50) = 50 (use items' totalPnL)
        expect(summary.totalPnL).toBeCloseTo(50, 5)
        expect(summary.totalPnLPercent).toBeCloseTo((50 / 3000) * 100, 5)
        // todayPnL = 31.4 + (-60) = -28.6
        expect(summary.todayPnL).toBeCloseTo(-28.6, 5)
        // yesterdayTotalValue = 3050 - (-28.6) = 3078.6
        expect(summary.todayPnLPercent).toBeCloseTo((-28.6 / 3078.6) * 100, 5)
        expect(summary.vix).toBe(22)
        // MSFT has larger |dailyPnL| (60 > 31.4)
        expect(summary.topContributor?.symbol).toBe('MSFT')
        expect(summary.topContributor?.dailyPnL).toBeCloseTo(-60, 5)
    })

    it('guards against division by zero when totalCost is 0', () => {
        const item = makeHoldingItem({ avgCost: 0, totalPnL: 0 })
        const summary = calculateSummary([item], 15)

        expect(summary.totalPnLPercent).toBe(0)
    })

    it('guards against division by zero when yesterdayTotalValue is 0', () => {
        // yesterdayTotalValue = totalValue - todayPnL
        // If totalValue == todayPnL → yesterdayTotalValue = 0
        const item = makeHoldingItem({
            shares: 10,
            currentPrice: 100,
            dailyPnL: 1000, // equal to totalValue
            totalPnL: 0,
            avgCost: 100,
        })
        const summary = calculateSummary([item], 15)

        expect(summary.todayPnLPercent).toBe(0)
    })

    it('passes vix through unchanged', () => {
        expect(calculateSummary([], 42).vix).toBe(42)
    })
})
