/**
 * Period definitions and day calculations for stock history.
 *
 * Migrated from the original history.ts module.
 */

export type Period = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y'

export const VALID_PERIODS: readonly Period[] = [
    '1D',
    '1W',
    '1M',
    '3M',
    'YTD',
    '1Y',
]

const PERIOD_DAYS: Record<Exclude<Period, 'YTD'>, number> = {
    '1D': 1,
    '1W': 5,
    '1M': 22,
    '3M': 65,
    '1Y': 252,
}

export function getDaysForPeriod(period: Period): number {
    if (period === 'YTD') {
        const now = new Date()
        const startOfYear = new Date(now.getFullYear(), 0, 1)
        const diffTime = Math.abs(now.getTime() - startOfYear.getTime())
        return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
    }
    return PERIOD_DAYS[period]
}
