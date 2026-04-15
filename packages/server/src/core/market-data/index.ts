/**
 * Market Data Module — Public API
 *
 * Assembles all service instances and exposes a flat, caller-friendly API.
 * Client instances (Yahoo, Finnhub) are created once at module load.
 * DB-backed cache stores are wired via createDbStore + Prisma queries.
 *
 * Callers should import everything from '@/core/market-data'.
 */

import type { StockMetrics } from '@flux/shared'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/core/db'
import type { CoverageStore } from './common/coverage'
import { FinnhubClient } from './common/finnhub-client'
// ── Common infrastructure ──
import { createDbStore } from './common/store-db'
import type {
    CacheStore,
    CompanyOverview,
    FinnhubNewsItem,
    HistoryPoint,
    HistoryStoreParams,
    Quote,
} from './common/types'
import { YahooFinanceClient } from './common/yahoo-client'
import { createHistoryService } from './history'
import { dedupeHistoryPointsByUtcDay } from './history/daily'
import { createInfoService } from './info'
import { createMacroService } from './macro'
import { createNewsService } from './news'
// ── Service factories ──
import { createQuoteService } from './quote'
import { createSearchService } from './search'

export { proxyFetch } from './common/proxy-fetch'
export { isValidSymbol, normalizeSymbol } from './common/symbol'
// ── Re-exports: types ──
export type {
    CompanyOverview,
    HistoryPoint,
    MarketDataClient,
    Quote,
} from './common/types'
export type {
    ChartDataPoint,
    HistoryService,
    Period,
    StockHistoryResult,
} from './history'
// ── Re-exports: constants & helpers ──
export { getDaysForPeriod, VALID_PERIODS } from './history'
export { findVixFromMacro, VIX_DISPLAY_NAME } from './macro'
export type { NewsItem } from './news'

// ---------------------------------------------------------------------------
// BigInt conversion helper (matches old sync.ts behavior)
// ---------------------------------------------------------------------------

function toBigIntSafe(value: number): bigint {
    return BigInt(Math.round(value))
}

// ---------------------------------------------------------------------------
// Client singletons — created once per process
// ---------------------------------------------------------------------------

function createYahooClient(): YahooFinanceClient {
    return new YahooFinanceClient()
}

function createFinnhubClient(): FinnhubClient {
    const apiKey = process.env.FINNHUB_API_KEY ?? ''
    return new FinnhubClient(apiKey)
}

const yahoo = createYahooClient()
const finnhub = createFinnhubClient()

// ---------------------------------------------------------------------------
// DB store adapters
// ---------------------------------------------------------------------------

function buildHistoryStore(
    db: PrismaClient,
): CacheStore<HistoryPoint[], HistoryStoreParams> {
    return createDbStore<HistoryPoint[], HistoryStoreParams>({
        async findByKey(symbol, params?) {
            // Build date filter when days is provided (matches old sync.ts behavior)
            const dateFilter = params?.days
                ? (() => {
                      const days = params.days
                      const now = new Date()
                      const endDate = new Date(
                          Date.UTC(
                              now.getUTCFullYear(),
                              now.getUTCMonth(),
                              now.getUTCDate(),
                          ),
                      )
                      const startDate = new Date(
                          endDate.getTime() - days * 24 * 60 * 60 * 1000,
                      )
                      return { gte: startDate, lte: endDate }
                  })()
                : undefined

            const rows = await db.stockHistory.findMany({
                where: {
                    symbol,
                    ...(dateFilter ? { date: dateFilter } : {}),
                },
                orderBy: { date: 'asc' },
            })
            if (rows.length === 0) return null
            const latestFetchedAt = rows.reduce(
                (max, r) => (r.fetchedAt > max ? r.fetchedAt : max),
                rows[0].fetchedAt,
            )
            return {
                data: dedupeHistoryPointsByUtcDay(
                    rows.map((r) => ({
                        date: r.date,
                        open: r.open,
                        high: r.high,
                        low: r.low,
                        close: r.close,
                        volume:
                            r.volume != null ? Number(r.volume) : undefined,
                    })),
                ),
                fetchedAt: latestFetchedAt,
            }
        },
        async upsertByKey(symbol, data) {
            // Upsert doesn't need date-range params — always writes by symbol+date key
            const normalized = dedupeHistoryPointsByUtcDay(data)
            if (normalized.length === 0) return
            await db.$transaction(
                normalized.map((h) =>
                    db.stockHistory.upsert({
                        where: { symbol_date: { symbol, date: h.date } },
                        update: {
                            open: h.open,
                            high: h.high,
                            low: h.low,
                            close: h.close,
                            volume:
                                h.volume != null
                                    ? toBigIntSafe(h.volume)
                                    : null,
                            fetchedAt: new Date(),
                        },
                        create: {
                            symbol,
                            date: h.date,
                            open: h.open,
                            high: h.high,
                            low: h.low,
                            close: h.close,
                            volume:
                                h.volume != null
                                    ? toBigIntSafe(h.volume)
                                    : null,
                        },
                    }),
                ),
            )
        },
    })
}

function buildInfoStore(db: PrismaClient): CacheStore<CompanyOverview> {
    return createDbStore<CompanyOverview>({
        async findByKey(symbol) {
            const row = await db.stockInfo.findUnique({ where: { symbol } })
            if (!row) return null
            return {
                data: {
                    symbol: row.symbol,
                    name: row.name ?? symbol,
                    sector: row.sector ?? undefined,
                    pe: row.pe ?? undefined,
                    marketCap:
                        row.marketCap != null
                            ? Number(row.marketCap)
                            : undefined,
                    eps: row.eps ?? undefined,
                    dividendYield: row.dividendYield ?? undefined,
                },
                fetchedAt: row.fetchedAt,
            }
        },
        async upsertByKey(symbol, data) {
            await db.stockInfo.upsert({
                where: { symbol },
                update: {
                    name: data.name ?? null,
                    pe: data.pe ?? null,
                    marketCap:
                        data.marketCap != null
                            ? toBigIntSafe(data.marketCap)
                            : null,
                    eps: data.eps ?? null,
                    dividendYield: data.dividendYield ?? null,
                    sector: data.sector ?? null,
                    fetchedAt: new Date(),
                },
                create: {
                    symbol: data.symbol,
                    name: data.name ?? null,
                    pe: data.pe ?? null,
                    marketCap:
                        data.marketCap != null
                            ? toBigIntSafe(data.marketCap)
                            : null,
                    eps: data.eps ?? null,
                    dividendYield: data.dividendYield ?? null,
                    sector: data.sector ?? null,
                },
            })
        },
    })
}

function buildNewsStore(db: PrismaClient): CacheStore<FinnhubNewsItem[]> {
    return createDbStore<FinnhubNewsItem[]>({
        async findByKey(symbol) {
            const rows = await db.newsArticle.findMany({
                where: { symbol },
                orderBy: { publishedAt: 'desc' },
            })
            if (rows.length === 0) return null
            const latestFetchedAt = rows.reduce(
                (max, r) => (r.fetchedAt > max ? r.fetchedAt : max),
                rows[0].fetchedAt,
            )
            return {
                data: rows.map((r) => ({
                    category: '',
                    datetime: Math.floor(r.publishedAt.getTime() / 1000),
                    headline: r.headline,
                    id: Number(r.id) || 0,
                    image: r.imageUrl ?? '',
                    related: r.symbol,
                    source: r.source,
                    summary: r.summary ?? '',
                    url: r.url,
                })),
                fetchedAt: latestFetchedAt,
            }
        },
        async upsertByKey(symbol, data) {
            if (data.length === 0) return
            const articles = data.map((item) => ({
                symbol: symbol.toUpperCase(),
                headline: item.headline,
                source: item.source,
                url: item.url,
                summary: item.summary || null,
                sentiment: 'neutral',
                imageUrl: item.image || null,
                publishedAt: new Date(item.datetime * 1000),
            }))
            await db.newsArticle.createMany({
                data: articles,
                skipDuplicates: true,
            })
            const urls = articles.map((a) => a.url)
            await db.newsArticle.updateMany({
                where: { url: { in: urls } },
                data: { fetchedAt: new Date() },
            })
        },
    })
}

function buildCoverageStore(db: PrismaClient): CoverageStore {
    return {
        async getCoveredFrom(symbol) {
            const row = await db.stockHistoryCoverage.findUnique({
                where: { symbol },
            })
            return row?.coveredFrom ?? null
        },
        async updateCoveredFrom(symbol, from) {
            await db.stockHistoryCoverage.upsert({
                where: { symbol },
                update: { coveredFrom: from },
                create: { symbol, coveredFrom: from },
            })
        },
    }
}

// ---------------------------------------------------------------------------
// Assemble services
// ---------------------------------------------------------------------------

const quoteService = createQuoteService({ yahoo, finnhub })
const historyService = createHistoryService({
    yahoo,
    finnhub,
    historyStore: buildHistoryStore(prisma),
    coverageStore: buildCoverageStore(prisma),
})
const infoService = createInfoService({
    yahoo,
    finnhub,
    infoStore: buildInfoStore(prisma),
})
const newsService = createNewsService({
    finnhub,
    newsStore: buildNewsStore(prisma),
})
const searchService = createSearchService({
    yahoo,
    prisma,
})
const macroService = createMacroService({ yahoo, finnhub })

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/** Get a real-time quote for a single symbol */
export const getQuote = quoteService.getQuote

/** Get batch quotes for multiple symbols in one call */
export const getBatchQuotes = quoteService.getBatchQuotes

/** Get stock history formatted for chart display (with period string) */
export const getHistory = historyService.getHistory

/** Get raw history points (for AI tools, report generation, etc.) */
export const getHistoryRaw = historyService.getHistoryRaw

/** Get company fundamentals (PE, MarketCap, EPS, etc.) */
export const getInfo = infoService.getInfo

/** Get stock news from Finnhub */
export const getNews = newsService.getNews

/** Search stocks by name or symbol (L1 DB + L2 Yahoo) */
export const searchStocks = searchService.search

/** Get macro indicators (SPY, QQQ, TNX, VIX) */
export const getMacro = macroService.getMacro

/** Clear the in-memory macro cache (used by tests) */
export const clearMacroCache = macroService.clearCache

/** Clear the in-memory quote cache (used by tests) */
export const clearQuoteCache = quoteService.clearCache

/** Clear all in-memory caches (quote + macro) */
export function clearAllMemoryCaches(): void {
    quoteService.clearCache()
    macroService.clearCache()
}

// ---------------------------------------------------------------------------
// Stock Info with watchlist name overlay (replaces old stock-info.ts)
// ---------------------------------------------------------------------------

export async function getStockInfo(symbol: string): Promise<StockMetrics> {
    const [info, watchlistItem] = await Promise.all([
        infoService.getInfo(symbol),
        prisma.watchlist
            .findUnique({ where: { symbol }, select: { name: true } })
            .catch(() => null),
    ])

    return {
        symbol: info.symbol,
        name: watchlistItem?.name ?? info.name,
        sector: info.sector,
        pe: info.pe,
        marketCap: info.marketCap,
        eps: info.eps,
        dividendYield: info.dividendYield,
        fetchedAt: new Date().toISOString(),
    }
}

export async function getStockQuote(symbol: string): Promise<Quote> {
    return getQuote(symbol)
}

// ---------------------------------------------------------------------------
// Backward-compatible aliases (used during migration, remove in Task 19+)
// ---------------------------------------------------------------------------

/** @deprecated Use getQuote */
export const getQuoteWithCache = getQuote

/** @deprecated Use getHistoryRaw */
export const getHistoryWithCache = getHistoryRaw

/** @deprecated Use getInfo */
export const getInfoWithCache = getInfo

/** @deprecated Use getMacro */
export const getMacroIndicators = getMacro

/** @deprecated Use getNews */
export const getStockNews = getNews
