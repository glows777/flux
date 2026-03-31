/**
 * Trading Agent Loop Utilities
 *
 * Utility functions used by heartbeatPlugin and other plugins:
 * - loadOrCreateBaseline: Load or create baseline equity from DB
 * - getMarketStatus: Returns current US market status based on Eastern Time
 */

import type { PrismaClient } from '@prisma/client'
import { BASELINE_KEY } from './types'

// ─── Baseline Management ──────────────────────────────────────────────────────

export async function loadOrCreateBaseline(
    db: PrismaClient,
    currentEquity: number,
): Promise<number> {
    const existing = await db.tradingAgentConfig.findUnique({
        where: { key: BASELINE_KEY },
    })

    if (existing) {
        return parseFloat(existing.value)
    }

    await db.tradingAgentConfig.create({
        data: { key: BASELINE_KEY, value: String(currentEquity) },
    })

    return currentEquity
}

// ─── Market Status ────────────────────────────────────────────────────────────

/**
 * Returns the current US market status based on Eastern Time.
 *
 * Market hours (ET):
 *   Pre-market:  04:00 – 09:30
 *   Open:        09:30 – 15:45
 *   Pre-close:   15:45 – 16:00
 *   After-hours: 16:00 – 20:00
 *   Closed:      20:00 – 04:00 (next day), weekends
 */
export function getMarketStatus(): '盘前' | '开盘' | '收盘前' | '盘后' | '休市（周末）' {
    const now = new Date()

    const etDayStr = now.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
    })
    const isWeekend = etDayStr === 'Sat' || etDayStr === 'Sun'

    if (isWeekend) return '休市（周末）'

    const etTimeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
    const [hourStr, minStr] = etTimeStr.split(':')
    const etMinutes = parseInt(hourStr, 10) * 60 + parseInt(minStr, 10)

    const PRE_MARKET_START = 4 * 60        // 04:00
    const MARKET_OPEN = 9 * 60 + 30        // 09:30
    const PRE_CLOSE_START = 15 * 60 + 45   // 15:45
    const MARKET_CLOSE = 16 * 60           // 16:00
    const AFTER_HOURS_END = 20 * 60        // 20:00

    if (etMinutes >= PRE_MARKET_START && etMinutes < MARKET_OPEN) return '盘前'
    if (etMinutes >= MARKET_OPEN && etMinutes < PRE_CLOSE_START) return '开盘'
    if (etMinutes >= PRE_CLOSE_START && etMinutes < MARKET_CLOSE) return '收盘前'
    if (etMinutes >= MARKET_CLOSE && etMinutes < AFTER_HOURS_END) return '盘后'

    return '休市（周末）'
}
