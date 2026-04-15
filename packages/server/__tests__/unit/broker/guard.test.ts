import { describe, expect, it } from 'bun:test'
import type { CreateOrderParams } from '@/core/broker/alpaca-client'
import { checkGuards, type GuardContext } from '@/core/broker/guard'

const baseContext: GuardContext = {
    account: {
        equity: 100_000,
        cash: 50_000,
        buyingPower: 50_000,
        lastEquity: 100_000,
        longMarketValue: 50_000,
    },
    todayOrders: [],
    currentPrice: 100,
}

const baseOrder: CreateOrderParams = {
    symbol: 'AAPL',
    side: 'buy',
    qty: 10,
    type: 'market',
}

describe('Guard Pipeline', () => {
    describe('max order amount', () => {
        it('passes when under limit', () => {
            const result = checkGuards(baseOrder, {
                ...baseContext,
                currentPrice: 100,
            })
            expect(result.passed).toBe(true)
        })

        it('rejects when over limit', () => {
            const result = checkGuards(
                { ...baseOrder, qty: 200 },
                { ...baseContext, currentPrice: 100 },
            )
            expect(result.passed).toBe(false)
            expect(result.reason).toContain('金额')
        })
    })

    describe('cooldown', () => {
        it('passes when no recent order for same symbol', () => {
            const result = checkGuards(baseOrder, baseContext)
            expect(result.passed).toBe(true)
        })

        it('rejects when same symbol traded within cooldown', () => {
            const recentOrder = {
                symbol: 'AAPL',
                side: 'buy',
                qty: 5,
                status: 'filled',
                filledQty: 5,
                filledAvgPrice: 100,
                createdAt: new Date(),
            }
            const result = checkGuards(baseOrder, {
                ...baseContext,
                todayOrders: [recentOrder],
            })
            expect(result.passed).toBe(false)
            expect(result.reason).toContain('冷却')
        })
    })

    describe('daily loss limit', () => {
        it('passes when no daily loss', () => {
            const result = checkGuards(baseOrder, baseContext)
            expect(result.passed).toBe(true)
        })

        it('rejects when daily loss exceeds limit', () => {
            const losingOrders = [
                {
                    symbol: 'TSLA',
                    side: 'sell',
                    qty: 10,
                    status: 'filled',
                    filledQty: 10,
                    filledAvgPrice: 50,
                    createdAt: new Date(),
                },
                {
                    symbol: 'TSLA',
                    side: 'buy',
                    qty: 10,
                    status: 'filled',
                    filledQty: 10,
                    filledAvgPrice: 600,
                    createdAt: new Date(Date.now() - 60000),
                },
            ]
            const result = checkGuards(baseOrder, {
                ...baseContext,
                todayOrders: losingOrders,
            })
            expect(result.passed).toBe(false)
            expect(result.reason).toContain('亏损')
        })
    })
})
