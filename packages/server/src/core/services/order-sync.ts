import Alpaca from '@alpacahq/alpaca-trade-api'
import { mapOrder } from '@/core/broker/alpaca-client'
import { notifyOrderEvent as defaultNotifyOrderEvent } from '@/core/trading-agent/discord-hook'
import type { OrderEventNotification } from '@/core/trading-agent/types'

export interface HandleOrderUpdateDeps {
    readonly db: {
        readonly order: {
            findUnique(
                args: Record<string, unknown>,
            ): Promise<Record<string, unknown> | null>
            update(
                args: Record<string, unknown>,
            ): Promise<Record<string, unknown>>
            create(
                args: Record<string, unknown>,
            ): Promise<Record<string, unknown>>
        }
    }
    readonly notifyOrderEvent: (n: OrderEventNotification) => Promise<void>
}

function normalizeInstant(value: unknown): number | string | null {
    if (value == null) return null
    if (value instanceof Date) return value.getTime()
    if (typeof value === 'boolean') return String(value)
    if (typeof value === 'string' || typeof value === 'number') {
        const timestamp = new Date(value).getTime()
        return Number.isNaN(timestamp) ? String(value) : timestamp
    }
    return String(value)
}

function shouldUpdateExistingOrder(
    existing: Record<string, unknown>,
    order: ReturnType<typeof mapOrder>,
): boolean {
    return (
        existing.status !== order.status ||
        existing.filledQty !== order.filledQty ||
        existing.filledAvgPrice !== order.filledAvgPrice ||
        normalizeInstant(existing.filledAt) !== normalizeInstant(order.filledAt)
    )
}

export async function handleOrderUpdate(
    event: { event: string; order: Record<string, unknown> },
    deps: HandleOrderUpdateDeps,
): Promise<void> {
    const order = mapOrder(event.order)
    const { db, notifyOrderEvent } = deps

    const existing = await db.order.findUnique({
        where: { alpacaOrderId: order.id },
    })

    if (existing) {
        if (shouldUpdateExistingOrder(existing, order)) {
            await db.order.update({
                where: { alpacaOrderId: order.id },
                data: {
                    status: order.status,
                    filledQty: order.filledQty,
                    filledAvgPrice: order.filledAvgPrice,
                    filledAt: order.filledAt ? new Date(order.filledAt) : null,
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
                filledAt: order.filledAt ? new Date(order.filledAt) : null,
                reasoning: '外部下单',
            },
        })
    }

    await notifyOrderEvent({
        event: event.event,
        symbol: order.symbol,
        side: order.side,
        qty: order.qty,
        type: order.type,
        limitPrice: order.limitPrice,
        stopPrice: order.stopPrice,
        filledQty: order.filledQty,
        filledAvgPrice: order.filledAvgPrice,
        timeInForce: order.timeInForce,
    })
}

export interface OrderSyncDeps {
    readonly db: HandleOrderUpdateDeps['db']
}

export interface OrderSyncService {
    start(): void
    stop(): void
    isConnected(): boolean
}

export function createOrderSyncService(deps: OrderSyncDeps): OrderSyncService {
    const keyId = process.env.ALPACA_API_KEY_ID
    const secretKey = process.env.ALPACA_API_SECRET_KEY

    if (!keyId || !secretKey) {
        console.log('[order-sync] Alpaca not configured, skipping WebSocket')
        return {
            start() {},
            stop() {},
            isConnected() {
                return false
            },
        }
    }

    const sdk = new Alpaca({ keyId, secretKey, paper: true })
    const tradeWs = sdk.trade_ws
    let connected = false

    tradeWs.onConnect(() => {
        connected = true
        console.log('[order-sync] WebSocket connected')
        tradeWs.subscribe(['trade_updates', 'account_updates'])
    })

    tradeWs.onDisconnect(() => {
        connected = false
        console.log('[order-sync] WebSocket disconnected')
    })

    tradeWs.onOrderUpdate(
        async (event: { event: string; order: Record<string, unknown> }) => {
            try {
                await handleOrderUpdate(event, {
                    db: deps.db,
                    notifyOrderEvent: defaultNotifyOrderEvent,
                })
            } catch (error) {
                console.error('[order-sync] handleOrderUpdate failed:', error)
            }
        },
    )

    tradeWs.onAccountUpdate((event: unknown) => {
        console.log('[order-sync] Account update:', JSON.stringify(event))
    })

    return {
        start() {
            tradeWs.connect()
        },
        stop() {
            tradeWs.disconnect()
        },
        isConnected() {
            return connected
        },
    }
}
