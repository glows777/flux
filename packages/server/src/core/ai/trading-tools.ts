import { tool } from 'ai'
import { z } from 'zod'
import { withTimeout } from './timeout'
import type { AlpacaClient, CreateOrderParams } from '@/core/broker/alpaca-client'
import { checkGuards, type GuardContext, type OrderRecord } from '@/core/broker/guard'

// ─── Types ───

export interface TradingToolDeps {
    readonly alpacaClient: AlpacaClient
    readonly db: {
        readonly order: {
            create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>
            findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>
            findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>
            update(args: Record<string, unknown>): Promise<Record<string, unknown>>
        }
    }
    readonly getQuote: (symbol: string) => Promise<{ price: number }>
}

// ─── Helpers ───

const TOOL_TIMEOUTS = {
    placeOrder: 15_000,
    cancelOrder: 10_000,
    closePosition: 15_000,
    getPortfolio: 10_000,
    getTradeHistory: 5_000,
} as const

async function getTodayFilledOrders(db: TradingToolDeps['db']): Promise<OrderRecord[]> {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const orders = await db.order.findMany({
        where: {
            status: 'filled',
            createdAt: { gte: today },
        },
    })

    return orders.map((o) => ({
        symbol: String(o.symbol),
        side: String(o.side),
        qty: Number(o.qty),
        status: String(o.status),
        filledQty: o.filledQty != null ? Number(o.filledQty) : null,
        filledAvgPrice: o.filledAvgPrice != null ? Number(o.filledAvgPrice) : null,
        createdAt: o.createdAt instanceof Date ? o.createdAt : new Date(String(o.createdAt)),
    }))
}

// ─── Factory ───

export function createTradingTools(deps: TradingToolDeps) {
    const { alpacaClient, db } = deps

    return {
        placeOrder: tool({
            description: '下单买入或卖出股票。必须提供交易理由。',
            inputSchema: z.object({
                symbol: z.string().describe('股票代码'),
                side: z.enum(['buy', 'sell']).describe('买入或卖出'),
                qty: z.number().positive().describe('数量'),
                type: z.enum(['market']).describe('订单类型（当前只支持市价单）'),
                reasoning: z.string().min(1).describe('交易理由（入场理由、目标价、止损位）'),
            }),
            execute: async ({ symbol, side, qty, type, reasoning }) => {
                try {
                    if (!alpacaClient.isConfigured()) {
                        return { error: 'Alpaca 未配置' }
                    }

                    // 1. Get current price
                    const quote = await deps.getQuote(symbol)
                    const currentPrice = quote.price

                    // 2. Guard checks
                    const account = await withTimeout(
                        alpacaClient.getAccount(),
                        TOOL_TIMEOUTS.placeOrder,
                        'getAccount',
                    )
                    if (!account) return { error: '无法获取账户信息' }

                    const todayOrders = await getTodayFilledOrders(db)

                    const guardContext: GuardContext = { account, todayOrders, currentPrice }
                    const params: CreateOrderParams = { symbol, side, qty, type }
                    const guardResult = checkGuards(params, guardContext)

                    if (!guardResult.passed) {
                        return { error: `风控拒绝: ${guardResult.reason}` }
                    }

                    // 3. Place order via Alpaca
                    const alpacaOrder = await withTimeout(
                        alpacaClient.createOrder(params),
                        TOOL_TIMEOUTS.placeOrder,
                        'createOrder',
                    )
                    if (!alpacaOrder) return { error: '下单失败' }

                    // 4. Write to DB
                    await db.order.create({
                        data: {
                            alpacaOrderId: alpacaOrder.id,
                            symbol,
                            side,
                            qty,
                            type,
                            timeInForce: 'day',
                            status: alpacaOrder.status,
                            filledQty: alpacaOrder.filledQty,
                            filledAvgPrice: alpacaOrder.filledAvgPrice,
                            filledAt: alpacaOrder.filledAt ? new Date(alpacaOrder.filledAt) : null,
                            reasoning,
                        },
                    })

                    return {
                        success: true,
                        order: {
                            id: alpacaOrder.id,
                            symbol,
                            side,
                            qty,
                            status: alpacaOrder.status,
                            filledAvgPrice: alpacaOrder.filledAvgPrice,
                        },
                    }
                } catch (error) {
                    return { error: error instanceof Error ? error.message : String(error) }
                }
            },
        }),

        cancelOrder: tool({
            description: '撤销一个未成交的订单',
            inputSchema: z.object({
                orderId: z.string().describe('数据库中的订单 ID'),
            }),
            execute: async ({ orderId }) => {
                try {
                    const order = await db.order.findUnique({ where: { id: orderId } })
                    if (!order) return { error: '订单不存在' }

                    const alpacaOrderId = String(order.alpacaOrderId)
                    const success = await withTimeout(
                        alpacaClient.cancelOrder(alpacaOrderId),
                        TOOL_TIMEOUTS.cancelOrder,
                        'cancelOrder',
                    )

                    if (!success) return { error: '撤单失败' }

                    await db.order.update({
                        where: { id: orderId },
                        data: { status: 'cancelled' },
                    })

                    return { success: true, orderId }
                } catch (error) {
                    return { error: error instanceof Error ? error.message : String(error) }
                }
            },
        }),

        closePosition: tool({
            description: '平仓某只股票的全部持仓。不经过风控检查（减少风险敞口永远允许）。',
            inputSchema: z.object({
                symbol: z.string().describe('股票代码'),
                reasoning: z.string().min(1).describe('平仓理由'),
            }),
            execute: async ({ symbol, reasoning }) => {
                try {
                    // Determine side from current position
                    const position = await alpacaClient.getPosition(symbol)
                    if (!position) return { error: `没有 ${symbol} 的持仓` }
                    const side = position.qty < 0 ? 'buy' : 'sell'

                    const alpacaOrder = await withTimeout(
                        alpacaClient.closePosition(symbol),
                        TOOL_TIMEOUTS.closePosition,
                        'closePosition',
                    )
                    if (!alpacaOrder) return { error: `平仓 ${symbol} 失败` }

                    await db.order.create({
                        data: {
                            alpacaOrderId: alpacaOrder.id,
                            symbol,
                            side,
                            qty: alpacaOrder.qty,
                            type: 'market',
                            timeInForce: 'day',
                            status: alpacaOrder.status,
                            filledQty: alpacaOrder.filledQty,
                            filledAvgPrice: alpacaOrder.filledAvgPrice,
                            filledAt: alpacaOrder.filledAt ? new Date(alpacaOrder.filledAt) : null,
                            reasoning,
                        },
                    })

                    return {
                        success: true,
                        order: {
                            id: alpacaOrder.id,
                            symbol,
                            side,
                            qty: alpacaOrder.qty,
                            status: alpacaOrder.status,
                            filledAvgPrice: alpacaOrder.filledAvgPrice,
                        },
                    }
                } catch (error) {
                    return { error: error instanceof Error ? error.message : String(error) }
                }
            },
        }),

        getPortfolio: tool({
            description: '获取当前 Alpaca 账户信息和所有持仓',
            inputSchema: z.object({}),
            execute: async () => {
                try {
                    const [account, positions] = await Promise.all([
                        withTimeout(alpacaClient.getAccount(), TOOL_TIMEOUTS.getPortfolio, 'getAccount'),
                        withTimeout(alpacaClient.getPositions(), TOOL_TIMEOUTS.getPortfolio, 'getPositions'),
                    ])

                    return {
                        account: account ?? { equity: 0, cash: 0, buyingPower: 0, lastEquity: 0, longMarketValue: 0 },
                        positions: positions.map((p) => ({
                            symbol: p.symbol,
                            qty: p.qty,
                            avgEntryPrice: p.avgEntryPrice,
                            currentPrice: p.currentPrice,
                            unrealizedPl: p.unrealizedPl,
                            changeToday: p.changeToday,
                        })),
                    }
                } catch (error) {
                    return { error: error instanceof Error ? error.message : String(error) }
                }
            },
        }),

        getTradeHistory: tool({
            description: '查询本地交易历史记录（含交易理由）',
            inputSchema: z.object({
                symbol: z.string().optional().describe('按股票代码过滤'),
                startDate: z.string().optional().describe('开始日期 (ISO format)'),
                endDate: z.string().optional().describe('结束日期 (ISO format)'),
                limit: z.number().optional().default(20).describe('最多返回条数'),
            }),
            execute: async ({ symbol, startDate, endDate, limit }) => {
                try {
                    const where: Record<string, unknown> = {}
                    if (symbol) where.symbol = symbol
                    if (startDate || endDate) {
                        const dateFilter: Record<string, Date> = {}
                        if (startDate) dateFilter.gte = new Date(startDate)
                        if (endDate) dateFilter.lte = new Date(endDate)
                        where.createdAt = dateFilter
                    }

                    const orders = await db.order.findMany({
                        where,
                        orderBy: { createdAt: 'desc' },
                        take: limit,
                    })

                    return {
                        orders: orders.map((o) => ({
                            id: o.id,
                            symbol: o.symbol,
                            side: o.side,
                            qty: o.qty,
                            type: o.type,
                            status: o.status,
                            filledAvgPrice: o.filledAvgPrice,
                            filledAt: o.filledAt,
                            reasoning: o.reasoning,
                            createdAt: o.createdAt,
                        })),
                        total: orders.length,
                    }
                } catch (error) {
                    return { error: error instanceof Error ? error.message : String(error) }
                }
            },
        }),
    }
}
