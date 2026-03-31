/**
 * Phase 3 Step 4: Earnings Cache Layer
 *
 * Wraps L1/L2 services with a Prisma-backed cache.
 * Cache expiry based on reportDate + 100 days (see quarter-utils).
 * Supports force refresh to bypass cache.
 * Uses dependency injection for testability.
 */

import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/core/db'
import { getEarningsL1 as defaultGetEarningsL1 } from './l1-service'
import { getEarningsL2 as defaultGetEarningsL2 } from './l2-service'
import { getCurrentQuarter, getQuarterKey, isEarningsCacheExpired } from './quarter-utils'
import { getAvailableFiscalQuarters as defaultGetAvailableFiscalQuarters } from './fiscal-quarters'
import type { CachedEarningsL1, CachedEarningsL2, CachedFiscalQuarters, EarningsL1, EarningsL2, FiscalQuarter, UpcomingEarning } from './types'

// ─── Types ───

export interface EarningsCacheRecord {
    readonly content: string
    readonly reportDate: Date
    readonly createdAt: Date
}

export interface UpsertCacheInput {
    readonly symbol: string
    readonly quarter: string
    readonly type: string
    readonly content: string
    readonly reportDate: Date
}

export interface L1CacheDeps {
    readonly findCache: (symbol: string, quarter: string, type: string) => Promise<EarningsCacheRecord | null>
    readonly upsertCache: (input: UpsertCacheInput) => Promise<void>
    readonly getEarningsL1: (symbol: string, year?: number, quarter?: number) => Promise<EarningsL1>
}

export interface L2CacheDeps {
    readonly findCache: (symbol: string, quarter: string, type: string) => Promise<EarningsCacheRecord | null>
    readonly upsertCache: (input: UpsertCacheInput) => Promise<void>
    readonly getEarningsL2: (symbol: string, year: number, quarter: number, l1Data: EarningsL1) => Promise<EarningsL2>
}

export interface QuartersCacheDeps {
    readonly findCache: (symbol: string, quarter: string, type: string) => Promise<EarningsCacheRecord | null>
    readonly upsertCache: (input: UpsertCacheInput) => Promise<void>
    readonly getAvailableFiscalQuarters: (symbol: string) => Promise<ReadonlyArray<FiscalQuarter>>
}

// ─── Default Deps ───

function defaultFindCache(symbol: string, quarter: string, type: string): Promise<EarningsCacheRecord | null> {
    return prisma.earningsCache.findUnique({
        where: { symbol_quarter_type: { symbol, quarter, type } },
        select: { content: true, reportDate: true, createdAt: true },
    })
}

async function defaultUpsertCache(input: UpsertCacheInput): Promise<void> {
    await prisma.earningsCache.upsert({
        where: {
            symbol_quarter_type: {
                symbol: input.symbol,
                quarter: input.quarter,
                type: input.type,
            },
        },
        create: {
            symbol: input.symbol,
            quarter: input.quarter,
            type: input.type,
            content: input.content,
            reportDate: input.reportDate,
        },
        update: {
            content: input.content,
            reportDate: input.reportDate,
        },
    })
}

function getDefaultL1Deps(): L1CacheDeps {
    return {
        findCache: defaultFindCache,
        upsertCache: defaultUpsertCache,
        getEarningsL1: (symbol, year, quarter) => defaultGetEarningsL1(symbol, year, quarter),
    }
}

function getDefaultL2Deps(): L2CacheDeps {
    return {
        findCache: defaultFindCache,
        upsertCache: defaultUpsertCache,
        getEarningsL2: (symbol, year, quarter, l1Data) => defaultGetEarningsL2(symbol, year, quarter, l1Data),
    }
}

function getDefaultQuartersDeps(): QuartersCacheDeps {
    return {
        findCache: defaultFindCache,
        upsertCache: defaultUpsertCache,
        getAvailableFiscalQuarters: (symbol) => defaultGetAvailableFiscalQuarters(symbol),
    }
}

// ─── Helpers ───

const L1_REQUIRED_KEYS = ['symbol', 'period', 'reportDate'] as const
const L2_REQUIRED_KEYS = ['symbol', 'period', 'tldr'] as const

/**
 * Safely parse JSON content from cache with structural validation.
 * Returns null if JSON is invalid or required top-level keys are missing.
 * Catches corrupt/incompatible cached data without needing full Zod schemas
 * (data was already validated before being stored).
 */
function safeParseCacheContent<T>(content: string, requiredKeys: readonly string[]): T | null {
    try {
        const parsed: unknown = JSON.parse(content)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
        const record = parsed as Record<string, unknown>
        const hasKeys = requiredKeys.every((key) => key in record)
        return hasKeys ? (parsed as T) : null
    } catch {
        return null
    }
}

// ─── L1 Cache ───

/**
 * Get L1 earnings data with cache layer.
 *
 * Flow:
 * 1. If forceRefresh → skip cache, fetch fresh
 * 2. Query DB for cached L1 data
 * 3. If hit && not expired && valid JSON → return cached
 * 4. Otherwise → fetch fresh L1, upsert to DB, return fresh
 *
 * @param symbol Stock ticker
 * @param year Fiscal year (defaults to current)
 * @param quarter Quarter 1-4 (defaults to current)
 * @param forceRefresh Skip cache and re-fetch
 * @param deps Injectable dependencies for testing
 */
export async function getL1WithCache(
    symbol: string,
    year?: number,
    quarter?: number,
    forceRefresh?: boolean,
    deps?: L1CacheDeps,
): Promise<CachedEarningsL1> {
    const { findCache, upsertCache, getEarningsL1 } = deps ?? getDefaultL1Deps()

    const currentQ = getCurrentQuarter()
    const targetYear = year ?? currentQ.year
    const targetQuarter = quarter ?? currentQ.quarter
    const quarterKey = getQuarterKey(targetYear, targetQuarter)

    // Check cache (unless force refresh)
    if (!forceRefresh) {
        const cached = await findCache(symbol, quarterKey, 'L1')

        if (cached && !isEarningsCacheExpired(cached.reportDate)) {
            const parsed = safeParseCacheContent<EarningsL1>(cached.content, L1_REQUIRED_KEYS)
            if (parsed) {
                return {
                    data: parsed,
                    cached: true,
                    cachedAt: cached.createdAt.toISOString(),
                    reportDate: cached.reportDate.toISOString(),
                }
            }
            // Invalid JSON in cache → fall through to fresh fetch
        }
    }

    // Fresh fetch
    const l1Data = await getEarningsL1(symbol, targetYear, targetQuarter)
    const reportDate = new Date(l1Data.reportDate)

    await upsertCache({
        symbol,
        quarter: quarterKey,
        type: 'L1',
        content: JSON.stringify(l1Data),
        reportDate,
    })

    return {
        data: l1Data,
        cached: false,
        cachedAt: null,
        reportDate: reportDate.toISOString(),
    }
}

// ─── L2 Cache ───

/**
 * Get L2 AI analysis with cache layer.
 *
 * Flow:
 * 1. If forceRefresh → skip cache, fetch fresh
 * 2. Query DB for cached L2 data
 * 3. If hit && not expired && valid JSON → return cached
 * 4. Otherwise → fetch fresh L2 (AI generation), upsert to DB, return fresh
 *
 * @param symbol Stock ticker
 * @param year Fiscal year
 * @param quarter Quarter 1-4
 * @param l1Data L1 data (provides reportDate and context for AI)
 * @param forceRefresh Skip cache and re-fetch
 * @param deps Injectable dependencies for testing
 */
export async function getL2WithCache(
    symbol: string,
    year: number,
    quarter: number,
    l1Data: EarningsL1,
    forceRefresh?: boolean,
    deps?: L2CacheDeps,
): Promise<CachedEarningsL2> {
    const { findCache, upsertCache, getEarningsL2 } = deps ?? getDefaultL2Deps()

    const quarterKey = getQuarterKey(year, quarter)

    // Check cache (unless force refresh)
    if (!forceRefresh) {
        const cached = await findCache(symbol, quarterKey, 'L2')

        if (cached && !isEarningsCacheExpired(cached.reportDate)) {
            const parsed = safeParseCacheContent<EarningsL2>(cached.content, L2_REQUIRED_KEYS)
            if (parsed) {
                return {
                    data: parsed,
                    cached: true,
                    cachedAt: cached.createdAt.toISOString(),
                    reportDate: cached.reportDate.toISOString(),
                }
            }
        }
    }

    // Fresh fetch (AI generation)
    const l2Data = await getEarningsL2(symbol, year, quarter, l1Data)
    const reportDate = new Date(l1Data.reportDate)

    await upsertCache({
        symbol,
        quarter: quarterKey,
        type: 'L2',
        content: JSON.stringify(l2Data),
        reportDate,
    })

    return {
        data: l2Data,
        cached: false,
        cachedAt: null,
        reportDate: reportDate.toISOString(),
    }
}

// ─── Quarters Cache ───

const QUARTERS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7d

function isQuartersCacheExpired(createdAt: Date): boolean {
    return Date.now() - createdAt.getTime() > QUARTERS_TTL_MS
}

/**
 * Get available fiscal quarters with 7d TTL cache.
 *
 * Flow:
 * 1. Query DB for cached QUARTERS data (symbol + "ALL" + "QUARTERS")
 * 2. If hit && not expired && valid JSON array → return cached
 * 3. Otherwise → fetch from FMP, upsert to DB, return fresh
 *
 * @param symbol Stock ticker
 * @param deps Injectable dependencies for testing
 */
export async function getQuartersWithCache(
    symbol: string,
    deps?: QuartersCacheDeps,
): Promise<CachedFiscalQuarters> {
    const { findCache, upsertCache, getAvailableFiscalQuarters } = deps ?? getDefaultQuartersDeps()

    const cached = await findCache(symbol, 'ALL', 'QUARTERS')

    if (cached && !isQuartersCacheExpired(cached.createdAt)) {
        const parsed = safeParseCacheArray<FiscalQuarter>(cached.content)
        if (parsed) {
            return {
                data: parsed,
                cached: true,
                cachedAt: cached.createdAt.toISOString(),
            }
        }
    }

    const quarters = await getAvailableFiscalQuarters(symbol)
    const reportDate = quarters.length > 0 ? new Date(quarters[0].date) : new Date()

    await upsertCache({
        symbol,
        quarter: 'ALL',
        type: 'QUARTERS',
        content: JSON.stringify(quarters),
        reportDate,
    })

    return {
        data: quarters,
        cached: false,
        cachedAt: null,
    }
}

/**
 * Safely parse a JSON array from cache content.
 * Returns null if the content is not a valid JSON array.
 */
function safeParseCacheArray<T>(content: string): ReadonlyArray<T> | null {
    try {
        const parsed: unknown = JSON.parse(content)
        return Array.isArray(parsed) ? (parsed as ReadonlyArray<T>) : null
    } catch {
        return null
    }
}

// ─── Brief Cache Queries (read-only, no external API calls) ───

export interface BriefCacheQueryDeps {
    readonly db: {
        readonly earningsCache: Pick<PrismaClient['earningsCache'], 'findFirst' | 'findMany'>
    }
}

function getDefaultBriefCacheQueryDeps(): BriefCacheQueryDeps {
    return { db: prisma }
}

/**
 * Query the latest L1 earnings data from cache for a given symbol.
 * Returns the most recent L1 entry (by reportDate desc), or null if not cached.
 * Does NOT call any external API — pure DB read.
 */
export async function queryLatestEarningsL1FromCache(
    symbol: string,
    deps: BriefCacheQueryDeps = getDefaultBriefCacheQueryDeps(),
): Promise<EarningsL1 | null> {
    const row = await deps.db.earningsCache.findFirst({
        where: { symbol, type: 'L1' },
        orderBy: { reportDate: 'desc' },
        select: { content: true },
    })
    if (!row) return null
    const { content } = row
    return safeParseCacheContent<EarningsL1>(content, ['symbol', 'period'])
}

/**
 * Batch query the latest L1 earnings data from cache for multiple symbols.
 * Returns a Map with one entry per requested symbol (null if not cached).
 * Uses a single DB query instead of N individual queries.
 * Does NOT call any external API — pure DB read.
 */
export async function queryLatestEarningsL1BatchFromCache(
    symbols: string[],
    deps: BriefCacheQueryDeps = getDefaultBriefCacheQueryDeps(),
): Promise<Map<string, EarningsL1 | null>> {
    const result = new Map<string, EarningsL1 | null>()
    if (symbols.length === 0) return result

    const rows = await deps.db.earningsCache.findMany({
        where: { symbol: { in: symbols }, type: 'L1' },
        orderBy: { reportDate: 'desc' },
        select: { symbol: true, content: true },
    })

    for (const row of rows) {
        if (result.has(row.symbol)) continue
        result.set(row.symbol, safeParseCacheContent<EarningsL1>(row.content, ['symbol', 'period']))
    }

    for (const s of symbols) {
        if (!result.has(s)) result.set(s, null)
    }
    return result
}

/**
 * Query upcoming earnings events within N days for a list of symbols.
 * Returns events sorted by reportDate ascending.
 * Does NOT call any external API — pure DB read.
 */
export async function queryUpcomingEarningsFromCache(
    symbols: string[],
    withinDays: number,
    deps: BriefCacheQueryDeps = getDefaultBriefCacheQueryDeps(),
): Promise<UpcomingEarning[]> {
    if (symbols.length === 0) return []

    const now = new Date()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + withinDays)

    const rows = await deps.db.earningsCache.findMany({
        where: {
            symbol: { in: symbols },
            type: 'L1',
            reportDate: { gte: now, lte: cutoff },
        },
        select: { symbol: true, reportDate: true, content: true },
        orderBy: { reportDate: 'asc' },
    })

    const results: UpcomingEarning[] = []
    for (const r of rows) {
        const l1 = safeParseCacheContent<EarningsL1>(r.content, ['symbol', 'period'])
        if (!l1) continue
        results.push({
            symbol: r.symbol,
            name: l1.name ?? r.symbol,
            event: `${l1.period} 财报`,
            date: r.reportDate.toISOString().slice(0, 10),
            daysAway: Math.ceil(
                (r.reportDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            ),
        })
    }
    return results
}
