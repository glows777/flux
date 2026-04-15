import type { PnlRecord } from './types'

interface RawOrder {
    readonly id: string
    readonly symbol: string
    readonly side: string
    readonly qty: number
    readonly type: string
    readonly status: string
    readonly filledAvgPrice: number | null
    readonly filledAt: Date | null
    readonly reasoning: string | null
    readonly createdAt: Date
}

interface OpenLot {
    qty: number
    readonly price: number
    readonly filledAt: Date
}

function daysBetween(a: Date, b: Date): number {
    return Math.round(
        Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24),
    )
}

export function calculateTradePnl(orders: readonly RawOrder[]): PnlRecord[] {
    if (orders.length === 0) return []

    const openLots = new Map<string, OpenLot[]>()
    const sorted = [...orders].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    )

    return sorted.map((order): PnlRecord => {
        const base = {
            symbol: order.symbol,
            side: order.side as 'buy' | 'sell',
            qty: order.qty,
            filledAvgPrice: order.filledAvgPrice,
            reasoning: order.reasoning,
            filledAt: order.filledAt,
            createdAt: order.createdAt,
        }

        if (
            order.side === 'buy' &&
            order.filledAvgPrice != null &&
            order.filledAt != null
        ) {
            const lots = openLots.get(order.symbol) ?? []
            lots.push({
                qty: order.qty,
                price: order.filledAvgPrice,
                filledAt: order.filledAt,
            })
            openLots.set(order.symbol, lots)
            return { ...base, realizedPl: null, holdingDays: null }
        }

        if (
            order.side === 'sell' &&
            order.filledAvgPrice != null &&
            order.filledAt != null
        ) {
            const lots = openLots.get(order.symbol) ?? []
            let remainingQty = order.qty
            let totalPl = 0
            let totalWeightedDays = 0

            while (remainingQty > 0 && lots.length > 0) {
                const lot = lots[0]
                const matchQty = Math.min(remainingQty, lot.qty)
                totalPl += (order.filledAvgPrice - lot.price) * matchQty
                totalWeightedDays +=
                    daysBetween(lot.filledAt, order.filledAt) * matchQty

                // Intentional mutation: lot.qty is a local working variable tracking remaining open inventory
                lot.qty -= matchQty
                remainingQty -= matchQty

                if (lot.qty <= 0) lots.shift()
            }

            const holdingDays =
                order.qty > 0 ? Math.round(totalWeightedDays / order.qty) : 0

            return {
                ...base,
                realizedPl: Math.round(totalPl * 100) / 100,
                holdingDays,
            }
        }

        return { ...base, realizedPl: null, holdingDays: null }
    })
}
