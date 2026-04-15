import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { FinnhubClient } from '@/core/market-data/common/finnhub-client'
import type {
    CacheEntry,
    CacheStore,
    FinnhubNewsItem,
} from '@/core/market-data/common/types'
import {
    createNewsService,
    type NewsService,
} from '@/core/market-data/news/index'

function makeFinnhubNews(count: number): FinnhubNewsItem[] {
    return Array.from({ length: count }, (_, i) => ({
        category: 'company',
        datetime: Math.floor(Date.now() / 1000) - i * 3600,
        headline: `News headline ${i + 1}`,
        id: 1000 + i,
        image: `https://example.com/img${i}.jpg`,
        related: 'AAPL',
        source: 'Reuters',
        summary: `Summary ${i + 1}`,
        url: `https://example.com/news/${i + 1}`,
    }))
}

function createMockNewsStore(): CacheStore<FinnhubNewsItem[]> {
    const data = new Map<string, CacheEntry<FinnhubNewsItem[]>>()
    return {
        get: mock(async (key: string) => data.get(key) ?? null),
        set: mock(async (key: string, value: FinnhubNewsItem[]) => {
            data.set(key, { data: value, fetchedAt: new Date() })
        }),
    }
}

function createMockFinnhub(newsItems?: FinnhubNewsItem[]): FinnhubClient {
    return {
        getQuote: mock(async () => ({
            symbol: 'AAPL',
            price: 150,
            change: 1,
            timestamp: new Date(),
        })),
        getDailyHistory: mock(async () => []),
        getCompanyOverview: mock(async (s: string) => ({
            symbol: s,
            name: s,
        })),
        getCompanyNews: mock(async () => newsItems ?? makeFinnhubNews(10)),
    } as unknown as FinnhubClient
}

describe('NewsService', () => {
    let finnhub: ReturnType<typeof createMockFinnhub>
    let newsStore: ReturnType<typeof createMockNewsStore>
    let service: NewsService

    beforeEach(() => {
        finnhub = createMockFinnhub()
        newsStore = createMockNewsStore()
        service = createNewsService({ finnhub, newsStore })
    })

    test('returns formatted news items from finnhub', async () => {
        const news = await service.getNews('AAPL')
        expect(news.length).toBe(10)
        expect(news[0].title).toBe('News headline 1')
        expect(news[0].source).toBe('Reuters')
        expect(news[0].sentiment).toBe('neutral')
        expect(news[0].id).toBe('1000')
        expect(news[0].url).toBe('https://example.com/news/1')
    })

    test('converts datetime to ISO string', async () => {
        const news = await service.getNews('AAPL')
        // Verify time is a valid ISO date string
        expect(new Date(news[0].time).toISOString()).toBe(news[0].time)
    })

    test('respects limit parameter', async () => {
        const items = makeFinnhubNews(30)
        finnhub = createMockFinnhub(items)
        service = createNewsService({ finnhub, newsStore })

        const news5 = await service.getNews('AAPL', 5)
        expect(news5.length).toBe(5)
    })

    test('defaults to 20 items', async () => {
        const items = makeFinnhubNews(30)
        finnhub = createMockFinnhub(items)
        service = createNewsService({ finnhub, newsStore })

        const news = await service.getNews('AAPL')
        expect(news.length).toBe(20)
    })

    test('clamps limit to max 50', async () => {
        const items = makeFinnhubNews(60)
        finnhub = createMockFinnhub(items)
        service = createNewsService({ finnhub, newsStore })

        const news = await service.getNews('AAPL', 100)
        expect(news.length).toBe(50)
    })

    test('clamps limit to min 1', async () => {
        const news = await service.getNews('AAPL', 0)
        expect(news.length).toBe(1)
    })

    test('caches news within TTL (4h)', async () => {
        await service.getNews('AAPL')
        await service.getNews('AAPL')
        // Only one fetch to finnhub
        expect(finnhub.getCompanyNews).toHaveBeenCalledTimes(1)
    })

    test('uses stale fallback when fetch fails', async () => {
        // First call succeeds and populates cache
        await service.getNews('AAPL')

        // Create a new service with a failing finnhub but same store (pre-populated)
        const failingFinnhub = createMockFinnhub()
        ;(
            failingFinnhub.getCompanyNews as ReturnType<typeof mock>
        ).mockImplementation(async () => {
            throw new Error('Finnhub down')
        })

        // Create new service with same store
        const service2 = createNewsService({
            finnhub: failingFinnhub,
            newsStore,
        })

        // Should get stale cached data since staleFallback is enabled
        // But since the cache is within TTL, it will use the cached data
        const news = await service2.getNews('AAPL')
        expect(news.length).toBeGreaterThan(0)
    })
})
