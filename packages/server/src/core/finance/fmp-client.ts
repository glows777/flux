/**
 * Phase 3 Step 2: FMP API Client
 *
 * Generic fetch + Zod validation client for Financial Modeling Prep API.
 * Uses dependency injection (FmpClientDeps) for testability.
 * Default deps: proxyFetch + FMP_API_KEY env var.
 */

import { z } from 'zod'
import { proxyFetch } from '@/core/market-data'
import {
    FmpBalanceSheetSchema,
    FmpCashFlowSchema,
    FmpEarningsSurpriseSchema,
    FmpError,
    FmpIncomeStatementSchema,
    FmpProfileSchema,
    FmpTranscriptSchema,
    type FmpBalanceSheet,
    type FmpCashFlow,
    type FmpEarningsSurprise,
    type FmpIncomeStatement,
    type FmpProfile,
    type FmpTranscript,
} from './types'

export const FMP_BASE_URL = 'https://financialmodelingprep.com/stable'

const REQUEST_TIMEOUT_MS = 10_000

// ─── Dependency Injection ───

export interface FmpClientDeps {
    readonly fetch: (url: string, init?: RequestInit) => Promise<Response>
    readonly apiKey: string
}

function getDefaultDeps(): FmpClientDeps {
    const apiKey = process.env.FMP_API_KEY ?? ''
    if (!apiKey) {
        throw new FmpError('FMP_API_KEY not configured', 'CONFIG_ERROR')
    }
    return {
        fetch: (url, init) => proxyFetch(url, init),
        apiKey,
    }
}

// ─── HTTP Error Mapping ───

function mapHttpStatus(status: number): FmpError {
    if (status === 401 || status === 403) {
        return new FmpError(`FMP API auth error (HTTP ${status})`, 'CONFIG_ERROR')
    }
    if (status === 429) {
        return new FmpError(`FMP API rate limited (HTTP ${status})`, 'RATE_LIMITED')
    }
    if (status === 404) {
        return new FmpError(`FMP resource not found (HTTP ${status})`, 'NOT_FOUND')
    }
    return new FmpError(`FMP API error (HTTP ${status})`, 'API_ERROR')
}

// ─── Generic Request ───

/**
 * Generic FMP API request with Zod validation.
 * All FMP endpoints return JSON arrays — this validates each item.
 */
async function fmpRequest<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    params?: Record<string, string>,
    deps?: FmpClientDeps,
): Promise<T[]> {
    const { fetch: fetchFn, apiKey } = deps ?? getDefaultDeps()

    if (!apiKey) {
        throw new FmpError('FMP_API_KEY not configured', 'CONFIG_ERROR')
    }

    const url = new URL(`${FMP_BASE_URL}${endpoint}`)
    url.searchParams.set('apikey', apiKey)
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value)
        }
    }

    let response: Response
    try {
        response = await fetchFn(url.toString(), {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
    } catch (error) {
        throw new FmpError(
            `FMP network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'API_ERROR',
        )
    }

    if (!response.ok) {
        throw mapHttpStatus(response.status)
    }

    const raw: unknown = await response.json()

    // FMP returns arrays for all endpoints we use
    if (!Array.isArray(raw)) {
        throw new FmpError('FMP response is not an array', 'PARSE_ERROR')
    }

    const arraySchema = z.array(schema)
    const parsed = arraySchema.safeParse(raw)

    if (!parsed.success) {
        throw new FmpError(
            `FMP response validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
            'PARSE_ERROR',
        )
    }

    return parsed.data
}

// ─── Endpoint Wrappers ───

/** GET /stable/income-statement?symbol=X&period=quarter&limit=N */
export async function getIncomeStatements(
    symbol: string,
    limit: number = 5,
    deps?: FmpClientDeps,
): Promise<FmpIncomeStatement[]> {
    return fmpRequest(
        '/income-statement',
        FmpIncomeStatementSchema,
        { symbol, period: 'quarter', limit: String(limit) },
        deps,
    )
}

/** GET /stable/earnings?symbol=X */
export async function getEarningsSurprises(
    symbol: string,
    deps?: FmpClientDeps,
): Promise<FmpEarningsSurprise[]> {
    return fmpRequest('/earnings', FmpEarningsSurpriseSchema, { symbol }, deps)
}

/** GET /stable/cash-flow-statement?symbol=X&period=quarter&limit=N */
export async function getCashFlowStatement(
    symbol: string,
    limit: number = 1,
    deps?: FmpClientDeps,
): Promise<FmpCashFlow[]> {
    return fmpRequest(
        '/cash-flow-statement',
        FmpCashFlowSchema,
        { symbol, period: 'quarter', limit: String(limit) },
        deps,
    )
}

/** GET /stable/balance-sheet-statement?symbol=X&period=quarter&limit=N */
export async function getBalanceSheet(
    symbol: string,
    limit: number = 1,
    deps?: FmpClientDeps,
): Promise<FmpBalanceSheet[]> {
    return fmpRequest(
        '/balance-sheet-statement',
        FmpBalanceSheetSchema,
        { symbol, period: 'quarter', limit: String(limit) },
        deps,
    )
}

/** GET /stable/earning-call-transcript?symbol=X&quarter=Q&year=Y */
export async function getTranscript(
    symbol: string,
    year: number,
    quarter: number,
    deps?: FmpClientDeps,
): Promise<FmpTranscript[]> {
    return fmpRequest(
        '/earning-call-transcript',
        FmpTranscriptSchema,
        { symbol, quarter: String(quarter), year: String(year) },
        deps,
    )
}

/** GET /stable/profile?symbol=X */
export async function getProfile(symbol: string, deps?: FmpClientDeps): Promise<FmpProfile[]> {
    return fmpRequest('/profile', FmpProfileSchema, { symbol }, deps)
}
