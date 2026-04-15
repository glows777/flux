import { describe, expect, it } from 'bun:test'
import { calculateTradePnl } from '@/core/trading-agent/pnl'

const order = (overrides: Record<string, unknown>) => ({
    id: 'o1',
    symbol: 'NVDA',
    side: 'buy' as const,
    qty: 10,
    type: 'market',
    status: 'filled',
    filledAvgPrice: 140,
    filledAt: new Date('2026-03-20'),
    reasoning: 'test',
    createdAt: new Date('2026-03-20'),
    ...overrides,
})

function expectFound<T>(value: T | undefined): T {
    expect(value).toBeDefined()
    return value as T
}

describe('calculateTradePnl', () => {
    it('returns null realizedPl for open buy with no matching sell', () => {
        const orders = [order({ id: 'b1', side: 'buy' })]
        const result = calculateTradePnl(orders)
        expect(result[0].realizedPl).toBeNull()
        expect(result[0].holdingDays).toBeNull()
    })

    it('calculates P&L for a simple buy then sell pair', () => {
        const orders = [
            order({
                id: 'b1',
                side: 'buy',
                qty: 10,
                filledAvgPrice: 140,
                filledAt: new Date('2026-03-20'),
            }),
            order({
                id: 's1',
                side: 'sell',
                qty: 10,
                filledAvgPrice: 150,
                filledAt: new Date('2026-03-25'),
            }),
        ]
        const result = calculateTradePnl(orders)
        const sell = expectFound(result.find((r) => r.side === 'sell'))
        expect(sell.realizedPl).toBe(100) // (150-140)*10
        expect(sell.holdingDays).toBe(5)
    })

    it('handles FIFO: first buy matched first', () => {
        const orders = [
            order({
                id: 'b1',
                side: 'buy',
                qty: 10,
                filledAvgPrice: 100,
                filledAt: new Date('2026-03-01'),
                createdAt: new Date('2026-03-01'),
            }),
            order({
                id: 'b2',
                side: 'buy',
                qty: 10,
                filledAvgPrice: 120,
                filledAt: new Date('2026-03-10'),
                createdAt: new Date('2026-03-10'),
            }),
            order({
                id: 's1',
                side: 'sell',
                qty: 10,
                filledAvgPrice: 130,
                filledAt: new Date('2026-03-15'),
                createdAt: new Date('2026-03-15'),
            }),
        ]
        const result = calculateTradePnl(orders)
        const sell = expectFound(result.find((r) => r.side === 'sell'))
        // FIFO: sell matches b1 (price 100), P&L = (130-100)*10 = 300
        expect(sell.realizedPl).toBe(300)
        expect(sell.holdingDays).toBe(14)
    })

    it('handles closePosition (sell all)', () => {
        const orders = [
            order({
                id: 'b1',
                side: 'buy',
                qty: 5,
                filledAvgPrice: 100,
                filledAt: new Date('2026-03-01'),
                createdAt: new Date('2026-03-01'),
            }),
            order({
                id: 'b2',
                side: 'buy',
                qty: 5,
                filledAvgPrice: 110,
                filledAt: new Date('2026-03-05'),
                createdAt: new Date('2026-03-05'),
            }),
            order({
                id: 's1',
                side: 'sell',
                qty: 10,
                filledAvgPrice: 120,
                filledAt: new Date('2026-03-10'),
                createdAt: new Date('2026-03-10'),
            }),
        ]
        const result = calculateTradePnl(orders)
        const sell = expectFound(result.find((r) => r.side === 'sell'))
        // FIFO: first 5 from b1 (P&L = (120-100)*5 = 100), then 5 from b2 (P&L = (120-110)*5 = 50)
        // Total: 150
        expect(sell.realizedPl).toBe(150)
    })

    it('handles multiple symbols independently', () => {
        const orders = [
            order({
                id: 'b1',
                symbol: 'NVDA',
                side: 'buy',
                qty: 10,
                filledAvgPrice: 100,
            }),
            order({
                id: 'b2',
                symbol: 'TSLA',
                side: 'buy',
                qty: 5,
                filledAvgPrice: 200,
            }),
            order({
                id: 's1',
                symbol: 'NVDA',
                side: 'sell',
                qty: 10,
                filledAvgPrice: 110,
                filledAt: new Date('2026-03-25'),
            }),
        ]
        const result = calculateTradePnl(orders)
        const nvdaSell = expectFound(
            result.find((r) => r.symbol === 'NVDA' && r.side === 'sell'),
        )
        const tslaBuy = expectFound(result.find((r) => r.symbol === 'TSLA'))
        expect(nvdaSell.realizedPl).toBe(100)
        expect(tslaBuy.realizedPl).toBeNull()
    })

    it('returns empty array for empty input', () => {
        expect(calculateTradePnl([])).toEqual([])
    })
})
