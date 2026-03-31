/**
 * Phase 3 Step 2: L1 Service Unit Tests
 *
 * Test scenarios:
 * - Happy path: all 5 FMP calls succeed → correct EarningsL1
 * - BeatMiss: matches earnings surprise to correct quarter's date
 * - Margins: calculates gross/operating/net margin % for 5 quarters
 * - KeyFinancials: revenue, YoY (same quarter prev year), operatingIncome, fcf, debtToAssets
 * - Period/ReportDate: derives from latest income statement
 * - Default quarter: uses current quarter when year/quarter not specified
 * - Null handling: missing earnings surprise → null beatMiss fields
 * - Null handling: empty cash flow → null fcf
 * - Null handling: empty balance sheet → null debtToAssets
 * - Null handling: no prior year data → null revenueYoY
 * - Error propagation: FMP error bubbles up
 */

import { describe, expect, it } from 'bun:test'
import type { L1ServiceDeps } from '@/core/finance/l1-service'
import { getEarningsL1 } from '@/core/finance/l1-service'
import type {
    FmpBalanceSheet,
    FmpCashFlow,
    FmpEarningsSurprise,
    FmpIncomeStatement,
    FmpProfile,
} from '@/core/finance/types'
import { FmpError } from '@/core/finance/types'

// ─── Mock Data Factory ───

function createIncomeStatements(count: number, baseYear = 2024, baseQuarter = 3): FmpIncomeStatement[] {
    const quarters: FmpIncomeStatement[] = []
    let y = baseYear
    let q = baseQuarter

    for (let i = 0; i < count; i++) {
        // Generate somewhat realistic financial data
        const revenue = 90_000_000_000 + i * 1_000_000_000
        const periodEndMonth = q * 3
        const filingMonth = periodEndMonth + 1
        const filingYear = filingMonth > 12 ? y + 1 : y
        const actualFilingMonth = filingMonth > 12 ? filingMonth - 12 : filingMonth
        quarters.push({
            date: `${y}-${String(periodEndMonth).padStart(2, '0')}-28`,
            period: `Q${q}`,
            fiscalYear: String(y),
            filingDate: `${filingYear}-${String(actualFilingMonth).padStart(2, '0')}-15`,
            revenue,
            grossProfit: Math.round(revenue * 0.46),
            operatingIncome: Math.round(revenue * 0.31),
            netIncome: Math.round(revenue * 0.25),
            eps: 1.64 - i * 0.05,
        })
        q -= 1
        if (q === 0) {
            q = 4
            y -= 1
        }
    }

    return quarters
}

const MOCK_INCOME_5Q: FmpIncomeStatement[] = [
    {
        date: '2024-09-28',
        period: 'Q3',
        fiscalYear: '2024',
        filingDate: '2024-10-31',
        revenue: 94_930_000_000,
        grossProfit: 43_879_000_000,
        operatingIncome: 29_592_000_000,
        netIncome: 23_636_000_000,
        eps: 1.64,
    },
    {
        date: '2024-06-29',
        period: 'Q2',
        fiscalYear: '2024',
        filingDate: '2024-08-01',
        revenue: 85_777_000_000,
        grossProfit: 39_681_000_000,
        operatingIncome: 25_352_000_000,
        netIncome: 21_448_000_000,
        eps: 1.40,
    },
    {
        date: '2024-03-30',
        period: 'Q1',
        fiscalYear: '2024',
        filingDate: '2024-05-02',
        revenue: 90_753_000_000,
        grossProfit: 42_274_000_000,
        operatingIncome: 27_900_000_000,
        netIncome: 23_636_000_000,
        eps: 1.53,
    },
    {
        date: '2023-12-30',
        period: 'Q4',
        fiscalYear: '2023',
        filingDate: '2024-02-01',
        revenue: 119_575_000_000,
        grossProfit: 54_855_000_000,
        operatingIncome: 40_373_000_000,
        netIncome: 33_916_000_000,
        eps: 2.18,
    },
    {
        // Same quarter previous year (Q3 FY2023) — for YoY calculation
        date: '2023-09-30',
        period: 'Q3',
        fiscalYear: '2023',
        filingDate: '2023-11-02',
        revenue: 89_498_000_000,
        grossProfit: 40_427_000_000,
        operatingIncome: 26_969_000_000,
        netIncome: 22_956_000_000,
        eps: 1.46,
    },
]

const MOCK_EARNINGS_SURPRISES: FmpEarningsSurprise[] = [
    { date: '2024-10-31', epsActual: 1.64, epsEstimated: 1.55, revenueActual: 94930000000, revenueEstimated: 89500000000 },
    { date: '2024-07-25', epsActual: 1.40, epsEstimated: 1.34, revenueActual: 85777000000, revenueEstimated: 84400000000 },
]

const MOCK_CASH_FLOW: FmpCashFlow[] = [{ date: '2024-09-28', freeCashFlow: 26_810_000_000 }]

const MOCK_BALANCE_SHEET: FmpBalanceSheet[] = [
    { date: '2024-09-28', totalDebt: 104_590_000_000, totalAssets: 364_980_000_000 },
]

const MOCK_PROFILE: FmpProfile[] = [{ companyName: 'Apple Inc.', symbol: 'AAPL' }]

// ─── Default Deps ───

function createMockDeps(overrides?: Partial<L1ServiceDeps>): L1ServiceDeps {
    return {
        getIncomeStatements: async () => MOCK_INCOME_5Q,
        getEarningsSurprises: async () => MOCK_EARNINGS_SURPRISES,
        getCashFlowStatement: async () => MOCK_CASH_FLOW,
        getBalanceSheet: async () => MOCK_BALANCE_SHEET,
        getProfile: async () => MOCK_PROFILE,
        ...overrides,
    }
}

// ─── Happy Path ───

describe('getEarningsL1 — Happy Path', () => {
    it('returns correct symbol and name from profile', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        expect(result.symbol).toBe('AAPL')
        expect(result.name).toBe('Apple Inc.')
    })

    it('returns correct period from latest income statement', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        expect(result.period).toContain('Q3')
        expect(result.period).toContain('2024')
    })

    it('returns reportDate from latest income statement filingDate', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        expect(result.reportDate).toBe('2024-10-31')
    })
})

// ─── Beat/Miss ───

describe('getEarningsL1 — BeatMiss', () => {
    it('calculates EPS beat/miss from earnings surprises', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        expect(result.beatMiss.eps).not.toBeNull()
        expect(result.beatMiss.eps!.actual).toBe(1.64)
        expect(result.beatMiss.eps!.expected).toBe(1.55)
    })

    it('returns null eps beatMiss when no surprise matches the quarter', async () => {
        const deps = createMockDeps({
            getEarningsSurprises: async () => [],
        })
        const result = await getEarningsL1('AAPL', 2024, 3, deps)
        expect(result.beatMiss.eps).toBeNull()
    })

    it('calculates revenue beat/miss from earnings data', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        expect(result.beatMiss.revenue).not.toBeNull()
        expect(result.beatMiss.revenue!.actual).toBe(94930000000)
        expect(result.beatMiss.revenue!.expected).toBe(89500000000)
    })

    it('returns null revenue beatMiss when no surprise matches', async () => {
        const deps = createMockDeps({
            getEarningsSurprises: async () => [],
        })
        const result = await getEarningsL1('AAPL', 2024, 3, deps)
        expect(result.beatMiss.revenue).toBeNull()
    })
})

// ─── Margins ───

describe('getEarningsL1 — Margins', () => {
    it('returns 5 quarters of margin data', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        expect(result.margins).toHaveLength(5)
    })

    it('calculates gross margin as grossProfit / revenue * 100', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        const firstMargin = result.margins[0]
        const expected = (43_879_000_000 / 94_930_000_000) * 100
        expect(firstMargin.gross).toBeCloseTo(expected, 1)
    })

    it('calculates operating margin as operatingIncome / revenue * 100', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        const firstMargin = result.margins[0]
        const expected = (29_592_000_000 / 94_930_000_000) * 100
        expect(firstMargin.operating).toBeCloseTo(expected, 1)
    })

    it('calculates net margin as netIncome / revenue * 100', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        const firstMargin = result.margins[0]
        const expected = (23_636_000_000 / 94_930_000_000) * 100
        expect(firstMargin.net).toBeCloseTo(expected, 1)
    })

    it('includes quarter label for each margin entry', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        expect(result.margins[0].quarter).toBe('Q3 FY2024')
        expect(result.margins[1].quarter).toBe('Q2 FY2024')
        expect(result.margins[4].quarter).toBe('Q3 FY2023')
    })

    it('handles zero revenue gracefully (null margins)', async () => {
        const zeroRevenueData = [{ ...MOCK_INCOME_5Q[0], revenue: 0 }]
        const deps = createMockDeps({
            getIncomeStatements: async () => zeroRevenueData,
        })
        const result = await getEarningsL1('AAPL', 2024, 3, deps)
        expect(result.margins[0].gross).toBeNull()
        expect(result.margins[0].operating).toBeNull()
        expect(result.margins[0].net).toBeNull()
    })
})

// ─── Key Financials ───

describe('getEarningsL1 — KeyFinancials', () => {
    it('returns revenue from latest income statement', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        expect(result.keyFinancials.revenue).toBe(94_930_000_000)
    })

    it('returns operatingIncome from latest income statement', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        expect(result.keyFinancials.operatingIncome).toBe(29_592_000_000)
    })

    it('calculates revenueYoY as % change vs same quarter prior year', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        // (94,930 - 89,498) / 89,498 * 100 ≈ 6.07%
        const expectedYoY = ((94_930_000_000 - 89_498_000_000) / 89_498_000_000) * 100
        expect(result.keyFinancials.revenueYoY).not.toBeNull()
        expect(result.keyFinancials.revenueYoY!).toBeCloseTo(expectedYoY, 1)
    })

    it('returns null revenueYoY when no same-quarter-prev-year data exists', async () => {
        // Only provide 1 quarter — no YoY comparison possible
        const deps = createMockDeps({
            getIncomeStatements: async () => [MOCK_INCOME_5Q[0]],
        })
        const result = await getEarningsL1('AAPL', 2024, 3, deps)
        expect(result.keyFinancials.revenueYoY).toBeNull()
    })

    it('returns fcf from cash flow statement', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        expect(result.keyFinancials.fcf).toBe(26_810_000_000)
    })

    it('returns null fcf when cash flow data is empty', async () => {
        const deps = createMockDeps({
            getCashFlowStatement: async () => [],
        })
        const result = await getEarningsL1('AAPL', 2024, 3, deps)
        expect(result.keyFinancials.fcf).toBeNull()
    })

    it('calculates debtToAssets as totalDebt / totalAssets * 100', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        const expected = (104_590_000_000 / 364_980_000_000) * 100
        expect(result.keyFinancials.debtToAssets).not.toBeNull()
        expect(result.keyFinancials.debtToAssets!).toBeCloseTo(expected, 1)
    })

    it('returns null debtToAssets when balance sheet is empty', async () => {
        const deps = createMockDeps({
            getBalanceSheet: async () => [],
        })
        const result = await getEarningsL1('AAPL', 2024, 3, deps)
        expect(result.keyFinancials.debtToAssets).toBeNull()
    })

    it('returns null debtToAssets when totalAssets is zero', async () => {
        const deps = createMockDeps({
            getBalanceSheet: async () => [{ date: '2024-09-28', totalDebt: 100_000, totalAssets: 0 }],
        })
        const result = await getEarningsL1('AAPL', 2024, 3, deps)
        expect(result.keyFinancials.debtToAssets).toBeNull()
    })
})

// ─── Empty / Minimal Data ───

describe('getEarningsL1 — Empty Data Handling', () => {
    it('handles empty income statements gracefully', async () => {
        const deps = createMockDeps({
            getIncomeStatements: async () => [],
        })
        try {
            await getEarningsL1('AAPL', 2024, 3, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('NOT_FOUND')
        }
    })

    it('works with only 1 quarter of income data', async () => {
        const deps = createMockDeps({
            getIncomeStatements: async () => [MOCK_INCOME_5Q[0]],
        })
        const result = await getEarningsL1('AAPL', 2024, 3, deps)
        expect(result.margins).toHaveLength(1)
        expect(result.keyFinancials.revenueYoY).toBeNull()
    })

    it('falls back to symbol when profile returns empty', async () => {
        const deps = createMockDeps({
            getProfile: async () => [],
        })
        const result = await getEarningsL1('AAPL', 2024, 3, deps)
        expect(result.symbol).toBe('AAPL')
        expect(result.name).toBe('AAPL')
    })
})

// ─── Error Propagation ───

describe('getEarningsL1 — Error Propagation', () => {
    it('propagates FmpError from income statements', async () => {
        const deps = createMockDeps({
            getIncomeStatements: async () => {
                throw new FmpError('FMP API rate limited (HTTP 429)', 'RATE_LIMITED')
            },
        })
        try {
            await getEarningsL1('AAPL', 2024, 3, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('RATE_LIMITED')
        }
    })

    it('propagates FmpError from profile', async () => {
        const deps = createMockDeps({
            getProfile: async () => {
                throw new FmpError('FMP resource not found (HTTP 404)', 'NOT_FOUND')
            },
        })
        try {
            await getEarningsL1('AAPL', 2024, 3, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('NOT_FOUND')
        }
    })
})

// ─── Quarter Selection ───

describe('getEarningsL1 — Quarter Filtering', () => {
    it('uses the specified year and quarter to select the target income statement', async () => {
        const result = await getEarningsL1('AAPL', 2024, 3, createMockDeps())
        // Should select Q3 FY2024 as the target quarter
        expect(result.period).toContain('Q3')
        expect(result.reportDate).toBe('2024-10-31')
    })

    it('selects correct quarter from the income statement array', async () => {
        // Request Q2 2024 — should match the second income statement
        const result = await getEarningsL1('AAPL', 2024, 2, createMockDeps())
        expect(result.period).toContain('Q2')
        expect(result.reportDate).toBe('2024-08-01')
        expect(result.keyFinancials.revenue).toBe(85_777_000_000)
    })
})
