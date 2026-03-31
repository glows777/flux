/**
 * Phase 3 Step 2: L1 Earnings Service
 *
 * Aggregates data from 5 FMP endpoints in parallel into EarningsL1.
 * Uses dependency injection for testability.
 */

import type {
    EarningsL1,
    FmpBalanceSheet,
    FmpCashFlow,
    FmpEarningsSurprise,
    FmpIncomeStatement,
    FmpProfile,
} from './types'
import { FmpError } from './types'
import {
    getBalanceSheet as defaultGetBalanceSheet,
    getCashFlowStatement as defaultGetCashFlowStatement,
    getEarningsSurprises as defaultGetEarningsSurprises,
    getIncomeStatements as defaultGetIncomeStatements,
    getProfile as defaultGetProfile,
} from './fmp-client'
import { getCurrentQuarter } from './quarter-utils'

// ─── Dependency Injection ───

export interface L1ServiceDeps {
    readonly getIncomeStatements: (symbol: string, limit?: number) => Promise<FmpIncomeStatement[]>
    readonly getEarningsSurprises: (symbol: string) => Promise<FmpEarningsSurprise[]>
    readonly getCashFlowStatement: (symbol: string, limit?: number) => Promise<FmpCashFlow[]>
    readonly getBalanceSheet: (symbol: string, limit?: number) => Promise<FmpBalanceSheet[]>
    readonly getProfile: (symbol: string) => Promise<FmpProfile[]>
}

function getDefaultDeps(): L1ServiceDeps {
    return {
        getIncomeStatements: (symbol, limit) => defaultGetIncomeStatements(symbol, limit),
        getEarningsSurprises: (symbol) => defaultGetEarningsSurprises(symbol),
        getCashFlowStatement: (symbol, limit) => defaultGetCashFlowStatement(symbol, limit),
        getBalanceSheet: (symbol, limit) => defaultGetBalanceSheet(symbol, limit),
        getProfile: (symbol) => defaultGetProfile(symbol),
    }
}

// ─── Helpers ───

/** Derive quarter label from FMP income statement, e.g. "Q3 FY2026" */
function deriveQuarterLabel(stmt: FmpIncomeStatement): string {
    return `${stmt.period} FY${stmt.fiscalYear}`
}

/** Derive period string, e.g. "FY2026 Q3" */
function derivePeriod(stmt: FmpIncomeStatement): string {
    return `FY${stmt.fiscalYear} ${stmt.period}`
}

/** Safe divide: returns null if divisor is 0 */
function safeDivide(numerator: number, denominator: number): number | null {
    return denominator === 0 ? null : numerator / denominator
}

/** Calculate margin percentage, null if revenue is 0 */
function marginPercent(value: number, revenue: number): number | null {
    const ratio = safeDivide(value, revenue)
    return ratio !== null ? ratio * 100 : null
}

/**
 * Find the income statement matching the target quarter.
 * FMP returns period as "Q1", "Q2", "Q3", "Q4" and date starts with "YYYY-".
 */
function findTargetStatement(
    statements: FmpIncomeStatement[],
    year: number,
    quarter: number,
): FmpIncomeStatement | undefined {
    const targetPeriod = `Q${quarter}`
    const targetYear = String(year)
    return statements.find((s) => s.period === targetPeriod && s.fiscalYear === targetYear)
}

/**
 * Find the same quarter from the previous year for YoY calculation.
 */
function findSameQuarterPrevYear(
    statements: FmpIncomeStatement[],
    targetStmt: FmpIncomeStatement,
): FmpIncomeStatement | undefined {
    const prevYear = String(Number(targetStmt.fiscalYear) - 1)
    return statements.find((s) => s.period === targetStmt.period && s.fiscalYear === prevYear)
}

/**
 * Match earnings surprise to the target quarter.
 * Stable API /earnings provides announcement dates.
 * Earnings calls happen 1-2 months after fiscal quarter end.
 * Match by finding the closest announcement after the fiscal quarter end date.
 */
function findMatchingSurprise(
    surprises: FmpEarningsSurprise[],
    targetStmt: FmpIncomeStatement,
): FmpEarningsSurprise | undefined {
    const targetDate = targetStmt.date
    // Find the surprise announced after or on the statement date, closest to it
    // Surprises are sorted by date descending from FMP
    const candidates = surprises
        .filter((s) => s.date >= targetDate && s.epsActual !== null)
    // Return the closest one (smallest date >= targetDate)
    return candidates.length > 0
        ? candidates.reduce((a, b) => (a.date <= b.date ? a : b))
        : undefined
}

// ─── Main Service ───

/**
 * Fetch and aggregate L1 earnings data from FMP.
 *
 * Calls 5 FMP endpoints in parallel:
 * - Income statements (5 quarters)
 * - Earnings surprises
 * - Cash flow statement (1 quarter)
 * - Balance sheet (1 quarter)
 * - Company profile
 *
 * @param symbol Stock ticker symbol
 * @param year Target fiscal year (defaults to current)
 * @param quarter Target quarter 1-4 (defaults to current)
 * @param deps Injectable dependencies for testing
 */
export async function getEarningsL1(
    symbol: string,
    year?: number,
    quarter?: number,
    deps?: L1ServiceDeps,
): Promise<EarningsL1> {
    const {
        getIncomeStatements,
        getEarningsSurprises,
        getCashFlowStatement,
        getBalanceSheet,
        getProfile,
    } = deps ?? getDefaultDeps()

    const currentQ = getCurrentQuarter()
    const targetYear = year ?? currentQ.year
    const targetQuarter = quarter ?? currentQ.quarter

    // Parallel fetch all 5 endpoints
    const [incomeStatements, earningsSurprises, cashFlows, balanceSheets, profiles] = await Promise.all([
        getIncomeStatements(symbol, 5),
        getEarningsSurprises(symbol),
        getCashFlowStatement(symbol, 1),
        getBalanceSheet(symbol, 1),
        getProfile(symbol),
    ])

    // Find the target quarter's income statement
    const targetStmt = findTargetStatement(incomeStatements, targetYear, targetQuarter)

    if (!targetStmt) {
        // If no exact match, fall back to the first (most recent) statement
        if (incomeStatements.length === 0) {
            throw new FmpError(
                `No income statement data found for ${symbol}`,
                'NOT_FOUND',
            )
        }
    }

    const primaryStmt = targetStmt ?? incomeStatements[0]

    // Profile fallback
    const profile = profiles[0]
    const companyName = profile?.companyName ?? symbol
    const companySymbol = profile?.symbol ?? symbol

    // Beat/Miss — FMP stable /earnings provides both EPS and revenue data
    const matchedSurprise = findMatchingSurprise(earningsSurprises, primaryStmt)
    const epsBeatMiss = matchedSurprise?.epsActual != null && matchedSurprise?.epsEstimated != null
        ? { actual: matchedSurprise.epsActual, expected: matchedSurprise.epsEstimated }
        : null
    const revenueBeatMiss = matchedSurprise?.revenueActual != null && matchedSurprise?.revenueEstimated != null
        ? { actual: matchedSurprise.revenueActual, expected: matchedSurprise.revenueEstimated }
        : null

    // Margins — for all available income statements
    const margins = incomeStatements.map((stmt) => ({
        quarter: deriveQuarterLabel(stmt),
        gross: marginPercent(stmt.grossProfit, stmt.revenue),
        operating: marginPercent(stmt.operatingIncome, stmt.revenue),
        net: marginPercent(stmt.netIncome, stmt.revenue),
    }))

    // YoY Revenue — compare same quarter previous year
    const prevYearStmt = findSameQuarterPrevYear(incomeStatements, primaryStmt)
    const revenueYoY = prevYearStmt
        ? ((primaryStmt.revenue - prevYearStmt.revenue) / prevYearStmt.revenue) * 100
        : null

    // FCF
    const fcf = cashFlows.length > 0 ? cashFlows[0].freeCashFlow : null

    // Debt to Assets
    const bs = balanceSheets.length > 0 ? balanceSheets[0] : null
    const debtToAssets = bs && bs.totalAssets !== 0
        ? (bs.totalDebt / bs.totalAssets) * 100
        : null

    return {
        symbol: companySymbol,
        name: companyName,
        period: derivePeriod(primaryStmt),
        reportDate: primaryStmt.filingDate,
        beatMiss: {
            revenue: revenueBeatMiss,
            eps: epsBeatMiss,
        },
        margins,
        keyFinancials: {
            revenue: primaryStmt.revenue,
            revenueYoY,
            operatingIncome: primaryStmt.operatingIncome,
            fcf,
            debtToAssets,
        },
    }
}
