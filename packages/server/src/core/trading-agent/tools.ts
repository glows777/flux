/**
 * Trading Agent Tool Assembly
 *
 * Assembles exactly 14 tools for the autonomous trading agent loop.
 * Reuses existing tool factories where possible; provides guard-free
 * placeOrder (all 5 order types), cancelOrder, getPendingOrders,
 * and an Alpaca-backed getQuote for the agent context.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { createTools } from '@/core/ai/tools'
import { createTradingTools } from '@/core/ai/trading-tools'
import { createMemoryTools } from '@/core/ai/memory/tools'
import { createResearchTools } from '@/core/ai/research'
import { withTimeout } from '@/core/ai/timeout'
import { calculateTradePnl } from './pnl'
import type { TradingAgentDeps } from './types'

// ─── Constants ───────────────────────────────────────────────────────────────

const TOOL_TIMEOUTS = {
    placeOrder: 15_000,
    getQuote: 8_000,
    getTradeHistory: 5_000,
} as const

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createTradingAgentTools(deps: TradingAgentDeps) {
    const { alpacaClient, db, toolDeps, memoryDeps, researchDeps } = deps

    // ── Reused tool sets ──────────────────────────────────────────────────

    const { memory_read, memory_write, memory_list } = createMemoryTools(memoryDeps)

    const { getHistory, calculateIndicators } = createTools(toolDeps)

    const tradingToolDeps = {
        alpacaClient,
        db: db as Parameters<typeof createTradingTools>[0]['db'],
        getQuote: async (s: string) => {
            const r = await alpacaClient.getLastTrade(s)
            return { price: r?.price ?? 0 }
        },
    }
    const { getPortfolio, closePosition, cancelOrder } = createTradingTools(tradingToolDeps)

    const { webSearch, webFetch } = createResearchTools(researchDeps)

    // ── New: placeOrder (guard-free, all 5 order types) ───────────────────

    const placeOrder = tool({
        description: '下单买入或卖出股票（无风控检查）。支持 market/limit/stop/stop_limit/trailing_stop 五种订单类型。必须提供交易理由。',
        inputSchema: z.object({
            symbol: z.string().describe('股票代码'),
            side: z.enum(['buy', 'sell']).describe('买入或卖出'),
            qty: z.number().positive().describe('数量'),
            type: z.enum(['market', 'limit', 'stop', 'stop_limit', 'trailing_stop']).describe('订单类型'),
            reasoning: z.string().min(1).describe('交易理由（入场理由、目标价、止损位）'),
            limitPrice: z.number().optional().describe('限价单价格（limit/stop_limit 必填）'),
            stopPrice: z.number().optional().describe('止损价格（stop/stop_limit 必填）'),
            trailPercent: z.number().optional().describe('追踪止损百分比（trailing_stop 必填）'),
            timeInForce: z.enum(['day', 'gtc', 'ioc', 'fok']).optional().describe('订单有效期，默认 day'),
        }),
        execute: async ({ symbol, side, qty, type, reasoning, limitPrice, stopPrice, trailPercent, timeInForce }) => {
            try {
                if (!alpacaClient.isConfigured()) {
                    return { error: 'Alpaca 未配置' }
                }

                // Validate order type params
                if (type === 'limit' && limitPrice == null) return { error: 'limit 订单必须提供 limitPrice' }
                if (type === 'stop' && stopPrice == null) return { error: 'stop 订单必须提供 stopPrice' }
                if (type === 'stop_limit' && (limitPrice == null || stopPrice == null)) return { error: 'stop_limit 订单必须提供 limitPrice 和 stopPrice' }
                if (type === 'trailing_stop' && trailPercent == null) return { error: 'trailing_stop 订单必须提供 trailPercent' }

                const alpacaOrder = await withTimeout(
                    alpacaClient.createOrder({ symbol, side, qty, type, limitPrice, stopPrice, trailPercent, timeInForce }),
                    TOOL_TIMEOUTS.placeOrder,
                    'createOrder',
                )
                if (!alpacaOrder) return { error: '下单失败' }

                await db.order.create({
                    data: {
                        alpacaOrderId: alpacaOrder.id,
                        symbol,
                        side,
                        qty,
                        type,
                        limitPrice: limitPrice ?? null,
                        stopPrice: stopPrice ?? null,
                        trailPercent: trailPercent ?? null,
                        timeInForce: timeInForce ?? 'day',
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
    })

    // ── New: getQuote (Alpaca-backed) ─────────────────────────────────────

    const getQuote = tool({
        description: '通过 Alpaca 获取股票最新成交价',
        inputSchema: z.object({
            symbol: z.string().describe('股票代码'),
        }),
        execute: async ({ symbol }) => {
            try {
                const result = await withTimeout(
                    alpacaClient.getLastTrade(symbol),
                    TOOL_TIMEOUTS.getQuote,
                    'getLastTrade',
                )
                return { symbol, price: result?.price ?? 0 }
            } catch (error) {
                return { error: error instanceof Error ? error.message : String(error) }
            }
        },
    })

    // ── New: getTradeHistory (ALL orders for FIFO correctness) ────────────

    const getTradeHistory = tool({
        description: '查询本地交易历史记录（含 FIFO 盈亏计算）',
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

                // Fetch ALL matching orders for correct FIFO P&L calculation
                const allOrders = await db.order.findMany({
                    where,
                    orderBy: { createdAt: 'asc' },
                })

                const rawOrders = allOrders.map((o) => ({
                    id: String(o.id),
                    symbol: String(o.symbol),
                    side: String(o.side),
                    qty: Number(o.qty),
                    type: String(o.type),
                    status: String(o.status),
                    filledAvgPrice: o.filledAvgPrice != null ? Number(o.filledAvgPrice) : null,
                    filledAt: o.filledAt instanceof Date ? o.filledAt : o.filledAt != null ? new Date(String(o.filledAt)) : null,
                    reasoning: o.reasoning != null ? String(o.reasoning) : null,
                    createdAt: o.createdAt instanceof Date ? o.createdAt : new Date(String(o.createdAt)),
                }))

                // Run FIFO P&L over full history, then slice for output
                const pnlRecords = calculateTradePnl(rawOrders)
                const sliced = pnlRecords.slice(0, limit)

                return {
                    orders: sliced,
                    total: allOrders.length,
                }
            } catch (error) {
                return { error: error instanceof Error ? error.message : String(error) }
            }
        },
    })

    // ── New: getPendingOrders ─────────────────────────────────────────────

    const getPendingOrders = tool({
        description: '查询当前所有未成交的挂单（pending/new/partially_filled）',
        inputSchema: z.object({}),
        execute: async () => {
            try {
                const pendingOrders = await db.order.findMany({
                    where: { status: { in: ['new', 'partially_filled', 'accepted', 'pending_new'] } },
                    orderBy: { createdAt: 'desc' },
                })
                return {
                    orders: pendingOrders.map(o => ({
                        id: o.id, symbol: o.symbol, side: o.side, qty: o.qty,
                        type: o.type, status: o.status,
                        limitPrice: o.limitPrice, stopPrice: o.stopPrice,
                        trailPercent: o.trailPercent, timeInForce: o.timeInForce,
                        filledQty: o.filledQty, reasoning: o.reasoning, createdAt: o.createdAt,
                    })),
                    total: pendingOrders.length,
                }
            } catch (error) {
                return { error: error instanceof Error ? error.message : String(error) }
            }
        },
    })

    // ── Assemble 14-tool object ───────────────────────────────────────────

    return {
        // Memory (3)
        memory_read,
        memory_write,
        memory_list,
        // Market data (2)
        getHistory,
        calculateIndicators,
        // Portfolio / execution (3)
        getPortfolio,
        closePosition,
        cancelOrder,
        // Research (2)
        webSearch,
        webFetch,
        // Trading-agent specific (4)
        placeOrder,
        getQuote,
        getTradeHistory,
        getPendingOrders,
    }
}
