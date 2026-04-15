/**
 * News Service (Finnhub-only)
 *
 * Fetches company news from Finnhub with a 4-hour cache.
 * Falls back to stale cache when the API is unavailable.
 */

import type { NewsItem } from '@flux/shared'
import { CachedDataSource } from '../common/cached-source'
import type { FinnhubClient } from '../common/finnhub-client'
import type { CacheStore, FinnhubNewsItem } from '../common/types'

const NEWS_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours
const DEFAULT_RANGE_DAYS = 30
const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

export type { NewsItem }

export interface NewsService {
    getNews(symbol: string, limit?: number): Promise<NewsItem[]>
}

export function createNewsService(deps: {
    readonly finnhub: FinnhubClient
    readonly newsStore: CacheStore<FinnhubNewsItem[]>
}): NewsService {
    const source = new CachedDataSource<FinnhubNewsItem[]>({
        store: deps.newsStore,
        fetchFn: async (symbol) => {
            const now = new Date()
            const from = new Date(
                now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000,
            )
            const fmt = (d: Date) => d.toISOString().slice(0, 10)
            return deps.finnhub.getCompanyNews(symbol, fmt(from), fmt(now))
        },
        ttl: NEWS_TTL_MS,
        staleFallback: true,
    })

    return {
        async getNews(symbol, limit = DEFAULT_LIMIT) {
            const clamped = Math.min(Math.max(limit, 1), MAX_LIMIT)
            const items = await source.get(symbol)
            return items.slice(0, clamped).map(
                (item): NewsItem => ({
                    id: String(item.id),
                    source: item.source,
                    time: new Date(item.datetime * 1000).toISOString(),
                    title: item.headline,
                    sentiment: 'neutral' as const,
                    url: item.url,
                }),
            )
        },
    }
}
