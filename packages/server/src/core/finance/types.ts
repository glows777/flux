/**
 * Phase 3: Finance module type definitions + FMP response Zod schemas
 */

import { z } from 'zod'

// ─── FMP Response Schemas (runtime validation) ───

/** FMP /v3/income-statement — only fields we need */
export const FmpIncomeStatementSchema = z
    .object({
        date: z.string(),
        period: z.string(),
        fiscalYear: z.string(),
        filingDate: z.string(),
        revenue: z.number(),
        grossProfit: z.number(),
        operatingIncome: z.number(),
        netIncome: z.number(),
        eps: z.number(),
    })
    .strip()

/** FMP /stable/earnings */
export const FmpEarningsSurpriseSchema = z
    .object({
        date: z.string(),
        epsActual: z.number().nullable(),
        epsEstimated: z.number().nullable(),
        revenueActual: z.number().nullable(),
        revenueEstimated: z.number().nullable(),
    })
    .strip()

/** FMP /v3/cash-flow-statement */
export const FmpCashFlowSchema = z
    .object({
        date: z.string(),
        freeCashFlow: z.number(),
    })
    .strip()

/** FMP /v3/balance-sheet-statement */
export const FmpBalanceSheetSchema = z
    .object({
        date: z.string(),
        totalDebt: z.number(),
        totalAssets: z.number(),
    })
    .strip()

/** FMP /v3/earning_call_transcript */
export const FmpTranscriptSchema = z
    .object({
        quarter: z.number().int(),
        year: z.number().int(),
        content: z.string().min(1),
    })
    .strip()

/** FMP /v3/profile */
export const FmpProfileSchema = z
    .object({
        companyName: z.string(),
        symbol: z.string(),
    })
    .strip()

// ─── Inferred FMP types ───

export type FmpIncomeStatement = z.infer<typeof FmpIncomeStatementSchema>
export type FmpEarningsSurprise = z.infer<typeof FmpEarningsSurpriseSchema>
export type FmpCashFlow = z.infer<typeof FmpCashFlowSchema>
export type FmpBalanceSheet = z.infer<typeof FmpBalanceSheetSchema>
export type FmpTranscript = z.infer<typeof FmpTranscriptSchema>
export type FmpProfile = z.infer<typeof FmpProfileSchema>

// ─── Fiscal Quarter ───

export interface FiscalQuarter {
    readonly year: number // from stmt.fiscalYear
    readonly quarter: number // from stmt.period (1-4)
    readonly key: string // "YYYY-QN" for cache key / select value
    readonly label: string // display label, e.g. "2025 Q1 (2025-04-27)"
    readonly date: string // stmt.filingDate "YYYY-MM-DD"
}

// ─── L1 Output ───

export interface EarningsL1 {
    readonly symbol: string
    readonly name: string
    readonly period: string // "FY2025 Q3"
    readonly reportDate: string // "2025-01-15"
    readonly beatMiss: {
        readonly revenue: { readonly actual: number; readonly expected: number } | null
        readonly eps: { readonly actual: number; readonly expected: number } | null
    }
    readonly margins: ReadonlyArray<{
        readonly quarter: string // "Q3 2024"
        readonly gross: number | null // percentage
        readonly operating: number | null
        readonly net: number | null
    }>
    readonly keyFinancials: {
        readonly revenue: number
        readonly revenueYoY: number | null // percentage
        readonly operatingIncome: number
        readonly fcf: number | null
        readonly debtToAssets: number | null
    }
}

// ─── L2 Output ───

export interface EarningsL2 {
    readonly symbol: string
    readonly period: string
    readonly tldr: string // 3-5 sentence summary
    readonly guidance: {
        readonly nextQuarterRevenue: string
        readonly fullYearAdjustment: '上调' | '维持' | '下调' | '未提及'
        readonly keyQuote: string // original English quote from transcript
        readonly signal: '正面' | '中性' | '谨慎'
    }
    readonly segments: ReadonlyArray<{
        readonly name: string
        readonly value: string
        readonly yoy: string
        readonly comment: string
    }>
    readonly managementSignals: {
        readonly tone: '乐观' | '中性' | '谨慎'
        readonly keyPhrases: readonly string[]
        readonly quotes: ReadonlyArray<{ readonly en: string; readonly cn: string }>
        readonly analystFocus: readonly string[]
    }
    readonly suggestedQuestions: readonly string[]
}

// ─── Cache Wrappers ───

export interface CachedEarningsL1 {
    readonly data: EarningsL1
    readonly cachedAt: string | null // ISO date, null = fresh fetch
    readonly cached: boolean
    readonly reportDate: string // ISO date, for frontend display
}

export interface CachedEarningsL2 {
    readonly data: EarningsL2
    readonly cachedAt: string | null
    readonly cached: boolean
    readonly reportDate: string
}

export interface CachedFiscalQuarters {
    readonly data: ReadonlyArray<FiscalQuarter>
    readonly cached: boolean
    readonly cachedAt: string | null
}

// ─── Upcoming Earning (for Morning Brief) ───

export interface UpcomingEarning {
    readonly symbol: string
    readonly name: string
    readonly event: string   // "Q4 2024 财报"
    readonly date: string    // "2026-02-27"
    readonly daysAway: number
}

// ─── FMP Error ───

export type FmpErrorCode = 'CONFIG_ERROR' | 'API_ERROR' | 'RATE_LIMITED' | 'NOT_FOUND' | 'PARSE_ERROR'

export class FmpError extends Error {
    constructor(
        message: string,
        public readonly code: FmpErrorCode,
    ) {
        super(message)
        this.name = 'FmpError'
    }
}

/** Maps FmpErrorCode to HTTP status for API responses */
export const FMP_ERROR_CODE_TO_STATUS: Record<FmpErrorCode, number> = {
    CONFIG_ERROR: 500,
    API_ERROR: 502,
    RATE_LIMITED: 429,
    NOT_FOUND: 404,
    PARSE_ERROR: 502,
}
