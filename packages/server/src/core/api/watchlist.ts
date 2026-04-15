/**
 * P2-07 / P2-08: Watchlist API handlers
 *
 * Core logic for fetching, adding to watchlist items.
 * Uses dependency injection for testability.
 */

import type { WatchlistItemWithChart } from '@flux/shared'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { prisma as defaultPrisma } from '@/core/db'
import {
    type CompanyOverview,
    getHistoryRaw as defaultGetHistoryRaw,
    getInfo as defaultGetInfo,
    getQuote as defaultGetQuote,
    type HistoryPoint,
    type Quote,
} from '@/core/market-data'

interface WatchlistDeps {
    prisma: PrismaClient
    getQuote: (symbol: string) => Promise<Quote>
    getHistoryRaw: (symbol: string, days: number) => Promise<HistoryPoint[]>
}

export interface AddWatchlistDeps extends WatchlistDeps {
    getInfo: (symbol: string) => Promise<CompanyOverview>
}

export type AddWatchlistErrorCode =
    | 'INVALID_INPUT'
    | 'DUPLICATE'
    | 'SYMBOL_NOT_FOUND'
export type RemoveWatchlistErrorCode = 'INVALID_INPUT' | 'NOT_FOUND'

export class AddWatchlistError extends Error {
    constructor(
        message: string,
        public readonly code: AddWatchlistErrorCode,
    ) {
        super(message)
        this.name = 'AddWatchlistError'
    }
}

export class RemoveWatchlistError extends Error {
    constructor(
        message: string,
        public readonly code: RemoveWatchlistErrorCode,
    ) {
        super(message)
        this.name = 'RemoveWatchlistError'
    }
}

export interface RemoveWatchlistDeps {
    prisma: PrismaClient
}

function getDefaultDeps(): WatchlistDeps {
    return {
        prisma: defaultPrisma,
        getQuote: defaultGetQuote,
        getHistoryRaw: defaultGetHistoryRaw,
    }
}

export const CHART_DAYS = 20

export async function getWatchlistItems(
    deps?: WatchlistDeps,
): Promise<WatchlistItemWithChart[]> {
    const { prisma, getQuote, getHistoryRaw } = deps ?? getDefaultDeps()

    const watchlist = await prisma.watchlist.findMany({
        orderBy: { createdAt: 'asc' },
    })

    if (watchlist.length === 0) {
        return []
    }

    const results = await Promise.all(
        watchlist.map(async (stock): Promise<WatchlistItemWithChart | null> => {
            const [quoteResult, historyResult] = await Promise.allSettled([
                getQuote(stock.symbol),
                getHistoryRaw(stock.symbol, CHART_DAYS),
            ])

            const quote =
                quoteResult.status === 'fulfilled' ? quoteResult.value : null
            const history =
                historyResult.status === 'fulfilled'
                    ? historyResult.value
                    : null

            if (!quote || !history) {
                return null
            }

            return {
                id: stock.symbol,
                name: stock.name,
                price: quote.price,
                chg: quote.change,
                signal: '',
                score: 0,
                data: history.map((h) => h.close),
            }
        }),
    )

    return results.filter(
        (item): item is WatchlistItemWithChart => item !== null,
    )
}

// ─── P2-08: Add to Watchlist ───

const AddWatchlistSchema = z.object({
    symbol: z
        .string()
        .min(1)
        .max(10)
        .regex(/^[A-Za-z0-9.-]+$/)
        .toUpperCase(),
    name: z.string().max(200).trim().optional(),
})

interface AddWatchlistInput {
    symbol: string
    name?: string
}

function getAddDefaultDeps(): AddWatchlistDeps {
    return {
        ...getDefaultDeps(),
        getInfo: defaultGetInfo,
    }
}

async function resolveStockName(
    symbol: string,
    getInfo: (symbol: string) => Promise<CompanyOverview>,
): Promise<string> {
    try {
        const info = await getInfo(symbol)
        return info.name
    } catch {
        return symbol
    }
}

function isUniqueConstraintError(error: unknown): boolean {
    return (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
    )
}

export async function addToWatchlist(
    input: AddWatchlistInput,
    deps?: AddWatchlistDeps,
): Promise<WatchlistItemWithChart> {
    const { prisma, getQuote, getHistoryRaw, getInfo } =
        deps ?? getAddDefaultDeps()

    // 1. Validate input
    const parsed = AddWatchlistSchema.safeParse(input)
    if (!parsed.success) {
        throw new AddWatchlistError('Invalid symbol format', 'INVALID_INPUT')
    }

    const { symbol, name: providedName } = parsed.data

    // 2. Check for duplicate
    const existing = await prisma.watchlist.findUnique({ where: { symbol } })
    if (existing) {
        throw new AddWatchlistError('Symbol already in watchlist', 'DUPLICATE')
    }

    // 3. Validate symbol exists in market (reuse quote for response)
    const quote = await getQuote(symbol).catch(() => {
        throw new AddWatchlistError(
            'Invalid symbol or unable to fetch data',
            'SYMBOL_NOT_FOUND',
        )
    })

    // 4. Resolve company name
    const stockName = providedName ?? (await resolveStockName(symbol, getInfo))

    // 5. Create record (handle TOCTOU race on unique constraint)
    try {
        await prisma.watchlist.create({
            data: { symbol, name: stockName },
        })
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            throw new AddWatchlistError(
                'Symbol already in watchlist',
                'DUPLICATE',
            )
        }
        throw error
    }

    // 6. Fetch history for response (reuse quote from step 3)
    const history = await getHistoryRaw(symbol, CHART_DAYS)

    return {
        id: symbol,
        name: stockName,
        price: quote.price,
        chg: quote.change,
        signal: '',
        score: 0,
        data: history.map((h) => h.close),
    }
}

// ─── P2-09: Remove from Watchlist ───

const RemoveSymbolSchema = z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9.-]+$/)

function getRemoveDefaultDeps(): RemoveWatchlistDeps {
    return { prisma: defaultPrisma }
}

function isPrismaNotFoundError(error: unknown): boolean {
    return (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2025'
    )
}

export async function removeFromWatchlist(
    symbol: string,
    deps?: RemoveWatchlistDeps,
): Promise<void> {
    const { prisma } = deps ?? getRemoveDefaultDeps()

    // 1. Validate input
    const parsed = RemoveSymbolSchema.safeParse(symbol)
    if (!parsed.success) {
        throw new RemoveWatchlistError('Invalid symbol', 'INVALID_INPUT')
    }

    const upperSymbol = parsed.data.toUpperCase()

    // 2. Check existence
    const existing = await prisma.watchlist.findUnique({
        where: { symbol: upperSymbol },
    })

    if (!existing) {
        throw new RemoveWatchlistError(
            'Symbol not found in watchlist',
            'NOT_FOUND',
        )
    }

    // 3. Delete record (handle TOCTOU race — another request may delete first)
    try {
        await prisma.watchlist.delete({
            where: { symbol: upperSymbol },
        })
    } catch (error) {
        if (isPrismaNotFoundError(error)) {
            throw new RemoveWatchlistError(
                'Symbol not found in watchlist',
                'NOT_FOUND',
            )
        }
        throw error
    }
}
