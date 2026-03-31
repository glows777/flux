import { describe, it, expect } from 'bun:test'
import { createTradingTools, type TradingToolDeps } from '@/core/ai/trading-tools'
import type { AlpacaClient, AlpacaOrder, AlpacaAccount, AlpacaPosition } from '@/core/broker/alpaca-client'

const toolCtx = { toolCallId: 'tc1', messages: [] as any[], abortSignal: undefined as any }

const mockAccount: AlpacaAccount = {
    equity: 100_000, cash: 50_000, buyingPower: 50_000,
    lastEquity: 100_000, longMarketValue: 50_000,
}

const mockFilledOrder: AlpacaOrder = {
    id: 'alpaca-order-1', symbol: 'AAPL', qty: 5, filledQty: 5,
    side: 'buy', type: 'market', status: 'filled',
    filledAvgPrice: 150, filledAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
}

function buildDeps(overrides?: Partial<{ alpacaClient: Partial<AlpacaClient> }>): TradingToolDeps {
    const orders: Record<string, unknown>[] = []

    const defaultClient: AlpacaClient = {
        isConfigured: () => true,
        getAccount: async () => mockAccount,
        getPositions: async () => [],
        getPosition: async () => null,
        getOrders: async () => [],
        createOrder: async () => mockFilledOrder,
        cancelOrder: async () => true,
        closePosition: async () => mockFilledOrder,
    }

    return {
        alpacaClient: { ...defaultClient, ...overrides?.alpacaClient },
        db: {
            order: {
                create: async (args: { data: Record<string, unknown> }) => {
                    const order = { id: `order-${orders.length + 1}`, ...args.data }
                    orders.push(order)
                    return order
                },
                findMany: async () => orders,
                findUnique: async (args: Record<string, unknown>) => {
                    const where = args.where as { id?: string }
                    return orders.find((o) => o.id === where?.id) ?? null
                },
                update: async (args: Record<string, unknown>) => {
                    const where = args.where as { id?: string }
                    const data = args.data as Record<string, unknown>
                    const idx = orders.findIndex((o) => o.id === where?.id)
                    if (idx >= 0) {
                        orders[idx] = { ...orders[idx], ...data }
                    }
                    return orders[idx] ?? {}
                },
            },
        },
        getQuote: async () => ({ price: 150 }),
    }
}

describe('Trading Tools Integration', () => {
    describe('placeOrder', () => {
        it('succeeds: guard pass → alpaca → db', async () => {
            const tools = createTradingTools(buildDeps())
            const result = await tools.placeOrder.execute(
                { symbol: 'AAPL', side: 'buy', qty: 5, type: 'market', reasoning: 'Test buy' },
                toolCtx,
            )
            expect(result).toHaveProperty('success', true)
            expect((result as any).order.symbol).toBe('AAPL')
        })

        it('rejects when guard fails (over limit)', async () => {
            const tools = createTradingTools(buildDeps())
            const result = await tools.placeOrder.execute(
                { symbol: 'AAPL', side: 'buy', qty: 200, type: 'market', reasoning: 'Big buy' },
                toolCtx,
            )
            expect(result).toHaveProperty('error')
            expect((result as any).error).toContain('风控')
        })

        it('returns error when Alpaca not configured', async () => {
            const tools = createTradingTools(buildDeps({
                alpacaClient: { isConfigured: () => false },
            }))
            const result = await tools.placeOrder.execute(
                { symbol: 'AAPL', side: 'buy', qty: 5, type: 'market', reasoning: 'Test' },
                toolCtx,
            )
            expect(result).toHaveProperty('error')
            expect((result as any).error).toContain('Alpaca')
        })
    })

    describe('cancelOrder', () => {
        it('cancels an existing order', async () => {
            const deps = buildDeps()
            const tools = createTradingTools(deps)

            // Place an order first
            await tools.placeOrder.execute(
                { symbol: 'AAPL', side: 'buy', qty: 5, type: 'market', reasoning: 'Test' },
                toolCtx,
            )

            const result = await tools.cancelOrder.execute(
                { orderId: 'order-1' },
                toolCtx,
            )
            expect(result).toHaveProperty('success', true)
        })

        it('returns error for non-existent order', async () => {
            const tools = createTradingTools(buildDeps())
            const result = await tools.cancelOrder.execute(
                { orderId: 'non-existent' },
                toolCtx,
            )
            expect(result).toHaveProperty('error')
            expect((result as any).error).toContain('不存在')
        })
    })

    describe('closePosition', () => {
        it('returns error when no position', async () => {
            const tools = createTradingTools(buildDeps())
            const result = await tools.closePosition.execute(
                { symbol: 'AAPL', reasoning: 'Take profit' },
                toolCtx,
            )
            expect(result).toHaveProperty('error')
            expect((result as any).error).toContain('持仓')
        })

        it('closes an existing position', async () => {
            const mockPosition: AlpacaPosition = {
                symbol: 'AAPL', qty: 10, avgEntryPrice: 140, currentPrice: 155,
                marketValue: 1550, costBasis: 1400, unrealizedPl: 150,
                unrealizedPlPc: 0.107, changeToday: 0.02, lastdayPrice: 152,
            }
            const tools = createTradingTools(buildDeps({
                alpacaClient: { getPosition: async () => mockPosition },
            }))
            const result = await tools.closePosition.execute(
                { symbol: 'AAPL', reasoning: 'Take profit' },
                toolCtx,
            )
            expect(result).toHaveProperty('success', true)
            expect((result as any).order.side).toBe('sell')
        })
    })

    describe('getPortfolio', () => {
        it('returns account and positions', async () => {
            const tools = createTradingTools(buildDeps())
            const result = await tools.getPortfolio.execute({}, toolCtx)
            expect(result).toHaveProperty('account')
            expect(result).toHaveProperty('positions')
            expect((result as any).account.equity).toBe(100_000)
        })
    })

    describe('getTradeHistory', () => {
        it('returns orders with reasoning', async () => {
            const deps = buildDeps()
            const tools = createTradingTools(deps)

            await tools.placeOrder.execute(
                { symbol: 'AAPL', side: 'buy', qty: 5, type: 'market', reasoning: 'Bullish on earnings' },
                toolCtx,
            )

            const result = await tools.getTradeHistory.execute(
                { symbol: 'AAPL', limit: 10 },
                toolCtx,
            )
            expect((result as any).orders.length).toBeGreaterThan(0)
            expect((result as any).orders[0].reasoning).toBe('Bullish on earnings')
        })

        it('returns empty when no orders', async () => {
            const tools = createTradingTools(buildDeps())
            const result = await tools.getTradeHistory.execute({ limit: 10 }, toolCtx)
            expect((result as any).orders.length).toBe(0)
        })
    })
})
