import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { CachedDataSource } from '@/core/market-data/common/cached-source'
import { MemoryStore } from '@/core/market-data/common/store-memory'
import type { CacheEntry } from '@/core/market-data/common/types'

type InspectableMemoryStore<T> = MemoryStore<T> & {
    store: Map<string, CacheEntry<T>>
}

describe('CachedDataSource — simple strategy', () => {
    let store: MemoryStore<string>
    let fetchFn: ReturnType<typeof mock>

    beforeEach(() => {
        store = new MemoryStore<string>()
        fetchFn = mock(async (key: string) => `value-${key}`)
    })

    test('calls fetchFn on cache miss', async () => {
        const source = new CachedDataSource({ store, fetchFn, ttl: 60_000 })
        const result = await source.get('AAPL')
        expect(result).toBe('value-AAPL')
        expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    test('returns cached value on cache hit (within TTL)', async () => {
        const source = new CachedDataSource({ store, fetchFn, ttl: 60_000 })
        await source.get('AAPL')
        const result = await source.get('AAPL')
        expect(result).toBe('value-AAPL')
        expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    test('refetches after TTL expires', async () => {
        const source = new CachedDataSource({ store, fetchFn, ttl: 10 })
        await source.get('AAPL')
        await new Promise((r) => setTimeout(r, 20))
        await source.get('AAPL')
        expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    test('singleflight: concurrent requests share one fetch', async () => {
        let resolveFirst: (v: string) => void = () => {}
        const slowFetch = mock(
            () =>
                new Promise<string>((r) => {
                    resolveFirst = r
                }),
        )
        const source = new CachedDataSource({
            store,
            fetchFn: slowFetch,
            ttl: 60_000,
        })

        const p1 = source.get('AAPL')
        const p2 = source.get('AAPL')
        const p3 = source.get('AAPL')

        // Allow microtasks to settle so slowFetch is invoked
        await new Promise((r) => setTimeout(r, 0))
        resolveFirst('shared-value')
        const [r1, r2, r3] = await Promise.all([p1, p2, p3])

        expect(r1).toBe('shared-value')
        expect(r2).toBe('shared-value')
        expect(r3).toBe('shared-value')
        expect(slowFetch).toHaveBeenCalledTimes(1)
    })

    test('staleFallback returns expired cache on fetch failure', async () => {
        const source = new CachedDataSource({
            store,
            fetchFn,
            ttl: 10,
            staleFallback: true,
        })
        await source.get('AAPL')
        await new Promise((r) => setTimeout(r, 20))

        fetchFn.mockImplementation(() => {
            throw new Error('API down')
        })
        const result = await source.get('AAPL')
        expect(result).toBe('value-AAPL')
    })

    test('throws when fetch fails and no stale cache (staleFallback=false)', async () => {
        const failFetch = mock(() => {
            throw new Error('API down')
        })
        const source = new CachedDataSource({
            store,
            fetchFn: failFetch,
            ttl: 60_000,
        })
        expect(source.get('AAPL')).rejects.toThrow('API down')
    })
})

describe('CachedDataSource — tiered strategy', () => {
    test('old data (beyond recent window) is never expired', async () => {
        const store = new MemoryStore<string>()
        // Pre-populate with "old" data (30 days ago)
        const oldFetchedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ;(store as unknown as InspectableMemoryStore<string>).store.set(
            'AAPL',
            {
                data: 'old-value',
                fetchedAt: oldFetchedAt,
            },
        )

        const fetchFn = mock(async () => 'fresh')
        const source = new CachedDataSource({
            store,
            fetchFn,
            ttl: 0,
            strategy: 'tiered',
            tieredOptions: {
                recentWindowDays: 5,
                recentTtl: 24 * 60 * 60 * 1000,
            },
        })

        const result = await source.get('AAPL')
        expect(result).toBe('old-value') // NOT refetched
        expect(fetchFn).toHaveBeenCalledTimes(0)
    })

    test('recent data within window is expired by recentTtl', async () => {
        const store = new MemoryStore<string>()
        // Recent data but past its TTL (fetched 2 days ago, recentTtl is 1 day)
        const recentExpired = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        ;(store as unknown as InspectableMemoryStore<string>).store.set(
            'AAPL',
            {
                data: 'stale-recent',
                fetchedAt: recentExpired,
            },
        )

        const fetchFn = mock(async () => 'fresh')
        const source = new CachedDataSource({
            store,
            fetchFn,
            ttl: 0,
            strategy: 'tiered',
            tieredOptions: {
                recentWindowDays: 5,
                recentTtl: 24 * 60 * 60 * 1000,
            },
        })

        const result = await source.get('AAPL')
        expect(result).toBe('fresh') // Refetched
        expect(fetchFn).toHaveBeenCalledTimes(1)
    })
})
