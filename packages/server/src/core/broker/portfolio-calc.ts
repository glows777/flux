/**
 * Pure calculation functions for portfolio data.
 * Decoupled from Prisma Holding model — works directly with AlpacaPosition.
 */

import type { HoldingItem, PortfolioSummary } from '@flux/shared'
import type { AlpacaPosition } from './alpaca-client'

/**
 * Maps a single Alpaca position to the shared HoldingItem shape.
 * - totalPnL: uses Alpaca's unrealizedPl directly (not recomputed)
 * - dailyPnL: qty × (currentPrice − lastdayPrice)
 */
export function mapAlpacaPositionToHoldingItem(
    position: AlpacaPosition,
    name: string | null,
): HoldingItem {
    const dailyPnL = position.qty * (position.currentPrice - position.lastdayPrice)

    return {
        symbol: position.symbol,
        name,
        shares: position.qty,
        avgCost: position.avgEntryPrice,
        currentPrice: position.currentPrice,
        dailyChange: position.changeToday,
        totalPnL: position.unrealizedPl,
        dailyPnL,
    }
}

/**
 * Calculates an aggregate PortfolioSummary from a list of HoldingItems.
 *
 * - totalPnL:        Σ(item.totalPnL)  — uses each item's stored value
 * - totalPnLPercent: (totalPnL / totalCost) × 100, guarded for totalCost = 0
 * - todayPnL:        Σ(item.dailyPnL)
 * - todayPnLPercent: (todayPnL / yesterdayTotalValue) × 100,
 *                    where yesterdayTotalValue = totalValue − todayPnL,
 *                    guarded for yesterdayTotalValue = 0
 * - topContributor:  item with max |dailyPnL|, null for empty array
 */
export function calculateSummary(
    items: readonly HoldingItem[],
    vix: number,
): PortfolioSummary {
    if (items.length === 0) {
        return {
            totalValue: 0,
            totalCost: 0,
            totalPnL: 0,
            totalPnLPercent: 0,
            todayPnL: 0,
            todayPnLPercent: 0,
            topContributor: null,
            vix,
        }
    }

    const totalValue = items.reduce(
        (acc, item) => acc + item.shares * item.currentPrice,
        0,
    )
    const totalCost = items.reduce(
        (acc, item) => acc + item.shares * item.avgCost,
        0,
    )
    const totalPnL = items.reduce((acc, item) => acc + item.totalPnL, 0)
    const todayPnL = items.reduce((acc, item) => acc + item.dailyPnL, 0)

    const totalPnLPercent = totalCost === 0 ? 0 : (totalPnL / totalCost) * 100

    const yesterdayTotalValue = totalValue - todayPnL
    const todayPnLPercent =
        yesterdayTotalValue === 0 ? 0 : (todayPnL / yesterdayTotalValue) * 100

    const topItem = items.reduce((best, item) =>
        Math.abs(item.dailyPnL) > Math.abs(best.dailyPnL) ? item : best,
    )

    const topContributor = {
        symbol: topItem.symbol,
        name: topItem.name,
        dailyPnL: topItem.dailyPnL,
    }

    return {
        totalValue,
        totalCost,
        totalPnL,
        totalPnLPercent,
        todayPnL,
        todayPnLPercent,
        topContributor,
        vix,
    }
}
