/**
 * Phase 3: Quarter calculation utility functions
 */

const CACHE_EXPIRY_DAYS = 100
const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_QUARTER_COUNT = 8

interface QuarterInfo {
    readonly year: number
    readonly quarter: number
}

interface AvailableQuarter extends QuarterInfo {
    readonly key: string
}

/**
 * Derive fiscal quarter from a Date
 * Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
 */
export function getQuarterFromDate(date: Date): QuarterInfo {
    const month = date.getMonth() // 0-indexed
    const quarter = Math.floor(month / 3) + 1
    return { year: date.getFullYear(), quarter }
}

/**
 * Format as "YYYY-QN" key for cache lookups
 */
export function getQuarterKey(year: number, quarter: number): string {
    return `${year}-Q${quarter}`
}

/**
 * Get current calendar quarter
 */
export function getCurrentQuarter(): QuarterInfo {
    return getQuarterFromDate(new Date())
}

/**
 * Generate last N quarters in reverse chronological order (most recent first)
 *
 * @deprecated Use `getAvailableFiscalQuarters` from `./fiscal-quarters` instead.
 * This function generates calendar quarters which don't match company fiscal quarters
 * (e.g., NVDA fiscal Q1 is Apr-Jul, not Jan-Mar).
 */
export function getAvailableQuarters(count: number = DEFAULT_QUARTER_COUNT): ReadonlyArray<AvailableQuarter> {
    const { year: startYear, quarter: startQuarter } = getCurrentQuarter()
    const result: AvailableQuarter[] = []

    let y = startYear
    let q = startQuarter

    for (let i = 0; i < count; i++) {
        result.push({ year: y, quarter: q, key: getQuarterKey(y, q) })
        q -= 1
        if (q === 0) {
            q = 4
            y -= 1
        }
    }

    return result
}

/**
 * Check if cached earnings data is expired based on report date.
 * Expired when: now > reportDate + 100 days
 * (After ~100 days, next quarter earnings are likely published)
 */
export function isEarningsCacheExpired(reportDate: Date | string): boolean {
    const date = typeof reportDate === 'string' ? new Date(reportDate) : reportDate
    const expiryMs = date.getTime() + CACHE_EXPIRY_DAYS * MS_PER_DAY
    return Date.now() > expiryMs
}
