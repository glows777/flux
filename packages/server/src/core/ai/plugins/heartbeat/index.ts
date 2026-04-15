import type { PrismaClient } from '@prisma/client'
import type { StoreDeps } from '@/core/ai/memory/store'
import { getSlotContent, writeSlot } from '@/core/ai/memory/store'
import type { AlpacaClient } from '@/core/broker/alpaca-client'
import { notifyError } from '@/core/trading-agent/discord-hook'
import {
    getMarketStatus,
    loadOrCreateBaseline,
} from '@/core/trading-agent/loop'
import {
    type HeartbeatContext,
    MAX_STEPS,
    SEED_STRATEGY_CONTENT,
} from '@/core/trading-agent/types'
import type { AIPlugin, ChatParams, HookContext } from '../../runtime/types'

export interface HeartbeatPluginDeps {
    readonly alpacaClient: AlpacaClient
    readonly db: PrismaClient
    readonly memoryDeps?: StoreDeps
}

export function heartbeatPlugin(deps: HeartbeatPluginDeps): AIPlugin {
    const { alpacaClient, db, memoryDeps } = deps

    return {
        name: 'heartbeat',

        async beforeChat(ctx: HookContext): Promise<void> {
            // 1. Get account equity
            const account = await alpacaClient.getAccount()
            const equity = account?.equity ?? 0

            // Fallback order sync (ensures DB is fresh even if WebSocket is down)
            try {
                const openOrders = await alpacaClient.getOrders({
                    status: 'open',
                    limit: 50,
                })
                for (const order of openOrders) {
                    const existing = await db.order.findUnique({
                        where: { alpacaOrderId: order.id },
                    })
                    if (existing) {
                        if (
                            (existing as { status: string }).status !==
                            order.status
                        ) {
                            await db.order.update({
                                where: { alpacaOrderId: order.id },
                                data: {
                                    status: order.status,
                                    filledQty: order.filledQty,
                                    filledAvgPrice: order.filledAvgPrice,
                                    filledAt: order.filledAt
                                        ? new Date(order.filledAt)
                                        : null,
                                },
                            })
                        }
                    } else {
                        await db.order.create({
                            data: {
                                alpacaOrderId: order.id,
                                symbol: order.symbol,
                                side: order.side,
                                qty: order.qty,
                                type: order.type,
                                timeInForce: order.timeInForce ?? 'day',
                                status: order.status,
                                limitPrice: order.limitPrice,
                                stopPrice: order.stopPrice,
                                filledQty: order.filledQty,
                                filledAvgPrice: order.filledAvgPrice,
                                filledAt: order.filledAt
                                    ? new Date(order.filledAt)
                                    : null,
                                reasoning: '外部下单',
                            },
                        })
                    }
                }
            } catch (error) {
                console.warn('[heartbeat] syncOrdersFromAlpaca failed:', error)
            }

            // 2. Load or create baseline
            const baseline = await loadOrCreateBaseline(db, equity)

            // 3. Build heartbeat context
            const progress =
                baseline > 0 ? ((equity - baseline) / baseline) * 100 : 0
            const heartbeatCtx: HeartbeatContext = {
                timestamp: new Date(),
                marketStatus: getMarketStatus(),
                equity,
                baseline,
                progress,
            }

            // 4. Store in meta for autoTradingPromptPlugin to read
            ctx.meta.set('heartbeat', heartbeatCtx)

            // 5. Ensure seed strategy exists
            const strategyContent = await getSlotContent(
                'agent_strategy',
                memoryDeps,
            )
            if (!strategyContent) {
                await writeSlot(
                    'agent_strategy',
                    SEED_STRATEGY_CONTENT,
                    'system',
                    'initial seed',
                    memoryDeps,
                )
            }
        },

        transformParams(_ctx: HookContext, params: ChatParams): ChatParams {
            return { ...params, maxSteps: MAX_STEPS }
        },

        async onError(_ctx: HookContext, error: Error): Promise<void> {
            await notifyError(error.message)
        },
    }
}
