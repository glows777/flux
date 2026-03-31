/**
 * Phase 3: Manual Transcript Upload Service
 *
 * Stores user-uploaded earnings call transcripts as fallback
 * when FMP transcript endpoint is unavailable (HTTP 402).
 * Uses EarningsCache with type="TRANSCRIPT".
 *
 * Saves transcript → invalidates stale L2 cache so next
 * analysis regenerates using the new transcript.
 */

import { prisma } from '@/core/db'
import type { EarningsCacheRecord, UpsertCacheInput } from './cache'
import { getQuarterKey } from './quarter-utils'

// ─── Types ───

export interface SaveTranscriptResult {
    readonly symbol: string
    readonly quarter: string // "2024-Q3"
}

export interface TranscriptServiceDeps {
    readonly findCache: (symbol: string, quarter: string, type: string) => Promise<EarningsCacheRecord | null>
    readonly upsertCache: (input: UpsertCacheInput) => Promise<void>
    readonly deleteCache: (symbol: string, quarter: string, type: string) => Promise<void>
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

async function defaultDeleteCache(symbol: string, quarter: string, type: string): Promise<void> {
    await prisma.earningsCache.deleteMany({
        where: { symbol, quarter, type },
    })
}

function getDefaultDeps(): TranscriptServiceDeps {
    return {
        findCache: defaultFindCache,
        upsertCache: defaultUpsertCache,
        deleteCache: defaultDeleteCache,
    }
}

// ─── Public API ───

/**
 * Save uploaded transcript and invalidate stale L2 cache.
 *
 * Stores transcript as EarningsCache type="TRANSCRIPT", then deletes
 * any existing L2 cache for the same symbol/quarter so the next
 * analysis request regenerates using the new transcript.
 *
 * @param symbol Stock ticker (uppercase)
 * @param year Fiscal year
 * @param quarter Quarter 1-4
 * @param content Raw transcript text
 * @param reportDate Earnings report date
 * @param deps Injectable dependencies for testing
 */
export async function saveTranscript(
    symbol: string,
    year: number,
    quarter: number,
    content: string,
    reportDate: Date,
    deps?: TranscriptServiceDeps,
): Promise<SaveTranscriptResult> {
    const { upsertCache, deleteCache } = deps ?? getDefaultDeps()
    const quarterKey = getQuarterKey(year, quarter)

    await upsertCache({
        symbol,
        quarter: quarterKey,
        type: 'TRANSCRIPT',
        content,
        reportDate,
    })

    // Invalidate stale L2 cache so next analysis uses the new transcript
    await deleteCache(symbol, quarterKey, 'L2')

    return { symbol, quarter: quarterKey }
}

/**
 * Retrieve uploaded transcript if it exists.
 *
 * User-uploaded transcripts never expire — the user explicitly provided them,
 * unlike FMP-fetched data which gets stale when new quarters are published.
 *
 * Returns the raw transcript content string, or null if no uploaded
 * transcript exists for this symbol/quarter.
 *
 * @param symbol Stock ticker (uppercase)
 * @param year Fiscal year
 * @param quarter Quarter 1-4
 * @param deps Injectable dependencies for testing
 */
export async function getUploadedTranscript(
    symbol: string,
    year: number,
    quarter: number,
    deps?: TranscriptServiceDeps,
): Promise<string | null> {
    const { findCache } = deps ?? getDefaultDeps()
    const quarterKey = getQuarterKey(year, quarter)

    const cached = await findCache(symbol, quarterKey, 'TRANSCRIPT')

    if (!cached) return null

    return cached.content
}
