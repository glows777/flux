/**
 * Search Service
 *
 * Two-level stock search strategy:
 * L1: Local DB prefix/contains match across StockInfo, Watchlist, StockSearchQuery
 * L2: Yahoo Finance .search() fallback (only EQUITY results)
 *
 * Migrated from search.ts — wraps existing logic in a factory function.
 */

import type { PrismaClient } from '@prisma/client'
import type { YahooFinanceClient } from '../common/yahoo-client'

export const MAX_RESULTS = 10
export const L1_SUFFICIENT_COUNT = 5

export interface StockSearchResult {
    readonly symbol: string
    readonly name: string
}

export interface SearchService {
    search(query: string): Promise<StockSearchResult[]>
}

type PrismaSearchDeps = Pick<
    PrismaClient,
    'stockInfo' | 'watchlist' | 'stockSearchQuery'
>

interface YfSearchQuote {
    readonly symbol?: string
    readonly isYahooFinance?: boolean
    readonly quoteType?: string
    readonly longname?: string
    readonly shortname?: string
}

// --- L1: Local DB search ---

async function searchLocal(
    prisma: PrismaSearchDeps,
    query: string,
): Promise<StockSearchResult[]> {
    const [infoRows, watchlistRows, searchQueryRows] = await Promise.all([
        prisma.stockInfo.findMany({
            where: {
                OR: [
                    { symbol: { startsWith: query, mode: 'insensitive' } },
                    { name: { contains: query, mode: 'insensitive' } },
                ],
            },
            select: { symbol: true, name: true },
            take: MAX_RESULTS,
        }),
        prisma.watchlist.findMany({
            where: {
                OR: [
                    { symbol: { startsWith: query, mode: 'insensitive' } },
                    { name: { contains: query, mode: 'insensitive' } },
                ],
            },
            select: { symbol: true, name: true },
            take: MAX_RESULTS,
        }),
        prisma.stockSearchQuery.findMany({
            where: {
                OR: [
                    { symbol: { startsWith: query, mode: 'insensitive' } },
                    { cnName: { contains: query, mode: 'insensitive' } },
                ],
            },
            select: { symbol: true, cnName: true },
            take: MAX_RESULTS,
        }),
    ])

    // Merge with priority: Watchlist > StockSearchQuery (cnName) > StockInfo
    const seen = new Map<string, StockSearchResult>()

    // Lowest priority first — StockInfo
    for (const row of infoRows) {
        const key = row.symbol.toUpperCase()
        if (!seen.has(key)) {
            seen.set(key, { symbol: row.symbol, name: row.name ?? row.symbol })
        }
    }

    // Medium priority — StockSearchQuery (cnName)
    for (const row of searchQueryRows) {
        const key = row.symbol.toUpperCase()
        seen.set(key, { symbol: row.symbol, name: row.cnName })
    }

    // Highest priority — Watchlist
    for (const row of watchlistRows) {
        const key = row.symbol.toUpperCase()
        seen.set(key, { symbol: row.symbol, name: row.name })
    }

    return [...seen.values()]
}

// --- L2: Yahoo Finance search ---

async function searchYahoo(
    yahoo: YahooFinanceClient,
    query: string,
): Promise<StockSearchResult[]> {
    const result = await yahoo.search(query)
    return result.quotes
        .filter(
            (q: YfSearchQuote) =>
                q.quoteType === 'EQUITY' && q.isYahooFinance === true,
        )
        .map((q: YfSearchQuote) => ({
            symbol: q.symbol!,
            name: q.longname ?? q.shortname ?? q.symbol!,
        }))
}

// --- Factory ---

export function createSearchService(deps: {
    readonly yahoo: YahooFinanceClient
    readonly prisma: PrismaSearchDeps
}): SearchService {
    return {
        async search(query) {
            const trimmed = query.trim()
            if (trimmed === '') return []

            // L1: local DB search
            let l1Results: StockSearchResult[]
            try {
                l1Results = await searchLocal(deps.prisma, trimmed)
            } catch {
                l1Results = []
            }

            // If L1 has enough results, skip L2
            if (l1Results.length >= L1_SUFFICIENT_COUNT) {
                return l1Results.slice(0, MAX_RESULTS)
            }

            // L2: Yahoo Finance fallback
            let l2Results: StockSearchResult[]
            try {
                l2Results = await searchYahoo(deps.yahoo, trimmed)
            } catch {
                return l1Results.slice(0, MAX_RESULTS)
            }

            // Merge: L1 takes priority
            const seen = new Map<string, StockSearchResult>()
            for (const item of l1Results) {
                seen.set(item.symbol.toUpperCase(), item)
            }
            for (const item of l2Results) {
                const key = item.symbol.toUpperCase()
                if (!seen.has(key)) {
                    seen.set(key, item)
                }
            }

            return [...seen.values()].slice(0, MAX_RESULTS)
        },
    }
}
