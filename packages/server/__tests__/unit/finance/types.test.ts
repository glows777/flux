/**
 * Phase 3 Step 1: Types & Zod Schema Unit Tests
 *
 * Test scenarios:
 * - FmpIncomeStatementSchema: valid parsing, missing fields, extra fields
 * - FmpEarningsSurpriseSchema: valid parsing, missing fields
 * - FmpCashFlowSchema: valid parsing
 * - FmpBalanceSheetSchema: valid parsing
 * - FmpTranscriptSchema: valid parsing
 * - FmpProfileSchema: valid parsing
 */

import { describe, expect, it } from 'bun:test'
import {
    FmpBalanceSheetSchema,
    FmpCashFlowSchema,
    FmpEarningsSurpriseSchema,
    FmpIncomeStatementSchema,
    FmpProfileSchema,
    FmpTranscriptSchema,
} from '@/core/finance/types'

// ─── FmpIncomeStatementSchema ───

describe('FmpIncomeStatementSchema', () => {
    const validData = {
        date: '2024-09-28',
        period: 'Q3',
        fiscalYear: '2024',
        filingDate: '2024-10-31',
        revenue: 94930000000,
        grossProfit: 43879000000,
        operatingIncome: 29592000000,
        netIncome: 23636000000,
        eps: 1.64,
    }

    it('parses valid income statement data', () => {
        const result = FmpIncomeStatementSchema.safeParse(validData)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.revenue).toBe(94930000000)
            expect(result.data.eps).toBe(1.64)
            expect(result.data.period).toBe('Q3')
        }
    })

    it('strips extra fields', () => {
        const result = FmpIncomeStatementSchema.safeParse({
            ...validData,
            extraField: 'should be stripped',
            anotherExtra: 123,
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect('extraField' in result.data).toBe(false)
        }
    })

    it('rejects missing required fields', () => {
        const { revenue: _, ...missingRevenue } = validData
        const result = FmpIncomeStatementSchema.safeParse(missingRevenue)
        expect(result.success).toBe(false)
    })

    it('rejects non-number revenue', () => {
        const result = FmpIncomeStatementSchema.safeParse({ ...validData, revenue: 'not a number' })
        expect(result.success).toBe(false)
    })

    it('accepts zero values', () => {
        const result = FmpIncomeStatementSchema.safeParse({
            ...validData,
            revenue: 0,
            netIncome: 0,
        })
        expect(result.success).toBe(true)
    })

    it('accepts negative values (e.g. net loss)', () => {
        const result = FmpIncomeStatementSchema.safeParse({
            ...validData,
            netIncome: -500000000,
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.netIncome).toBe(-500000000)
        }
    })
})

// ─── FmpEarningsSurpriseSchema ───

describe('FmpEarningsSurpriseSchema', () => {
    const validData = {
        date: '2024-10-31',
        epsActual: 1.64,
        epsEstimated: 1.55,
        revenueActual: 94930000000,
        revenueEstimated: 89500000000,
    }

    it('parses valid earnings surprise data', () => {
        const result = FmpEarningsSurpriseSchema.safeParse(validData)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.epsActual).toBe(1.64)
            expect(result.data.epsEstimated).toBe(1.55)
            expect(result.data.revenueActual).toBe(94930000000)
        }
    })

    it('rejects missing epsActual', () => {
        const { epsActual: _, ...missing } = validData
        const result = FmpEarningsSurpriseSchema.safeParse(missing)
        expect(result.success).toBe(false)
    })

    it('rejects missing epsEstimated', () => {
        const { epsEstimated: _, ...missing } = validData
        const result = FmpEarningsSurpriseSchema.safeParse(missing)
        expect(result.success).toBe(false)
    })

    it('accepts negative earnings', () => {
        const result = FmpEarningsSurpriseSchema.safeParse({
            ...validData,
            epsActual: -0.5,
            epsEstimated: -0.3,
        })
        expect(result.success).toBe(true)
    })

    it('accepts null values (future unreported quarters)', () => {
        const result = FmpEarningsSurpriseSchema.safeParse({
            ...validData,
            epsActual: null,
            epsEstimated: null,
            revenueActual: null,
            revenueEstimated: null,
        })
        expect(result.success).toBe(true)
    })
})

// ─── FmpCashFlowSchema ───

describe('FmpCashFlowSchema', () => {
    const validData = {
        date: '2024-09-28',
        freeCashFlow: 26810000000,
    }

    it('parses valid cash flow data', () => {
        const result = FmpCashFlowSchema.safeParse(validData)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.freeCashFlow).toBe(26810000000)
        }
    })

    it('rejects missing freeCashFlow', () => {
        const result = FmpCashFlowSchema.safeParse({ date: '2024-09-28' })
        expect(result.success).toBe(false)
    })

    it('accepts negative free cash flow', () => {
        const result = FmpCashFlowSchema.safeParse({ ...validData, freeCashFlow: -1000000 })
        expect(result.success).toBe(true)
    })
})

// ─── FmpBalanceSheetSchema ───

describe('FmpBalanceSheetSchema', () => {
    const validData = {
        date: '2024-09-28',
        totalDebt: 104590000000,
        totalAssets: 364980000000,
    }

    it('parses valid balance sheet data', () => {
        const result = FmpBalanceSheetSchema.safeParse(validData)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.totalDebt).toBe(104590000000)
            expect(result.data.totalAssets).toBe(364980000000)
        }
    })

    it('rejects missing totalDebt', () => {
        const result = FmpBalanceSheetSchema.safeParse({ date: '2024-09-28', totalAssets: 364980000000 })
        expect(result.success).toBe(false)
    })

    it('rejects missing totalAssets', () => {
        const result = FmpBalanceSheetSchema.safeParse({ date: '2024-09-28', totalDebt: 104590000000 })
        expect(result.success).toBe(false)
    })
})

// ─── FmpTranscriptSchema ───

describe('FmpTranscriptSchema', () => {
    const validData = {
        quarter: 3,
        year: 2024,
        content: 'Good afternoon, everyone. Welcome to the Q3 2024 earnings call...',
    }

    it('parses valid transcript data', () => {
        const result = FmpTranscriptSchema.safeParse(validData)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.quarter).toBe(3)
            expect(result.data.year).toBe(2024)
            expect(result.data.content).toContain('Q3 2024')
        }
    })

    it('rejects missing content', () => {
        const result = FmpTranscriptSchema.safeParse({ quarter: 3, year: 2024 })
        expect(result.success).toBe(false)
    })

    it('rejects empty content', () => {
        const result = FmpTranscriptSchema.safeParse({ ...validData, content: '' })
        expect(result.success).toBe(false)
    })

    it('rejects non-integer quarter', () => {
        const result = FmpTranscriptSchema.safeParse({ ...validData, quarter: 1.5 })
        expect(result.success).toBe(false)
    })
})

// ─── FmpProfileSchema ───

describe('FmpProfileSchema', () => {
    const validData = {
        companyName: 'Apple Inc.',
        symbol: 'AAPL',
    }

    it('parses valid profile data', () => {
        const result = FmpProfileSchema.safeParse(validData)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.companyName).toBe('Apple Inc.')
            expect(result.data.symbol).toBe('AAPL')
        }
    })

    it('rejects missing companyName', () => {
        const result = FmpProfileSchema.safeParse({ symbol: 'AAPL' })
        expect(result.success).toBe(false)
    })

    it('rejects missing symbol', () => {
        const result = FmpProfileSchema.safeParse({ companyName: 'Apple Inc.' })
        expect(result.success).toBe(false)
    })

    it('strips extra fields', () => {
        const result = FmpProfileSchema.safeParse({
            ...validData,
            ceo: 'Tim Cook',
            industry: 'Technology',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect('ceo' in result.data).toBe(false)
        }
    })
})
