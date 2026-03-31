/**
 * Fiscal Quarters Service
 *
 * Derives available fiscal quarters from FMP income statement data
 * instead of computing calendar quarters locally.
 *
 * This fixes the calendar vs fiscal quarter mismatch for companies
 * like NVDA whose fiscal year doesn't align with the calendar year.
 */

import { type FmpClientDeps, getIncomeStatements } from './fmp-client'
import { getQuarterKey } from './quarter-utils'
import type { FiscalQuarter } from './types'

const DEFAULT_LIMIT = 5

interface FiscalQuartersOptions {
    readonly limit?: number
    readonly deps?: FmpClientDeps
}

function parseQuarterNumber(period: string): number {
    const match = period.match(/Q(\d)/)
    if (!match) {
        throw new Error(`Invalid period format: ${period}`)
    }
    return Number(match[1])
}

/**
 * Fetch available fiscal quarters from FMP income statement data.
 * Returns quarters in FMP's natural order (newest first), deduplicated by key.
 */
export async function getAvailableFiscalQuarters(
    symbol: string,
    options: FiscalQuartersOptions = {},
): Promise<ReadonlyArray<FiscalQuarter>> {
    const { limit = DEFAULT_LIMIT, deps } = options
    const statements = await getIncomeStatements(symbol, limit, deps)

    const seen = new Set<string>()
    const quarters: FiscalQuarter[] = []

    for (const stmt of statements) {
        const year = Number(stmt.fiscalYear)
        const quarter = parseQuarterNumber(stmt.period)
        const key = getQuarterKey(year, quarter)

        if (seen.has(key)) {
            continue
        }
        seen.add(key)

        quarters.push({
            year,
            quarter,
            key,
            label: `FY${year} Q${quarter} (${stmt.filingDate})`,
            date: stmt.filingDate,
        })
    }

    return quarters
}
