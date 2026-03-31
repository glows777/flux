import type { CacheStore } from './types'

export interface CachedDataSourceOptions<T, P extends Record<string, unknown> = Record<string, never>> {
    readonly store: CacheStore<T, P>
    readonly fetchFn: (key: string) => Promise<T>
    readonly ttl: number
    readonly strategy?: 'simple' | 'tiered'
    readonly tieredOptions?: {
        readonly recentWindowDays: number
        readonly recentTtl: number
    }
    readonly staleFallback?: boolean
}

export class CachedDataSource<T, P extends Record<string, unknown> = Record<string, never>> {
    private readonly store: CacheStore<T, P>
    private readonly fetchFn: (key: string) => Promise<T>
    private readonly ttl: number
    private readonly strategy: 'simple' | 'tiered'
    private readonly tieredOptions?: { recentWindowDays: number; recentTtl: number }
    private readonly staleFallback: boolean
    private readonly inflight = new Map<string, Promise<T>>()

    constructor(options: CachedDataSourceOptions<T, P>) {
        this.store = options.store
        this.fetchFn = options.fetchFn
        this.ttl = options.ttl
        this.strategy = options.strategy ?? 'simple'
        this.tieredOptions = options.tieredOptions
        this.staleFallback = options.staleFallback ?? false
    }

    async get(key: string, params?: P): Promise<T> {
        const existing = this.inflight.get(key)
        if (existing) return existing

        const promise = this.resolve(key, params)
        this.inflight.set(key, promise)

        try {
            return await promise
        } finally {
            this.inflight.delete(key)
        }
    }

    /** Bypass cache and force a fresh fetch. Used by withCoverage middleware. */
    async forceFetch(key: string): Promise<T> {
        const fresh = await this.fetchFn(key)
        await this.store.set(key, fresh)
        return fresh
    }

    private async resolve(key: string, params?: P): Promise<T> {
        const cached = await this.store.get(key, params)

        if (cached && !this.isExpired(cached.fetchedAt)) {
            return cached.data
        }

        try {
            const fresh = await this.fetchFn(key)
            await this.store.set(key, fresh)
            return fresh
        } catch (error) {
            if (this.staleFallback && cached) {
                return cached.data
            }
            throw error
        }
    }

    private isExpired(fetchedAt: Date): boolean {
        if (this.strategy === 'tiered' && this.tieredOptions) {
            const { recentWindowDays, recentTtl } = this.tieredOptions
            const recentCutoff =
                Date.now() - recentWindowDays * 24 * 60 * 60 * 1000

            // Data fetched before the recent window is "old" -- never expires
            if (fetchedAt.getTime() < recentCutoff) {
                return false
            }
            // Recent data: use recentTtl
            return Date.now() - fetchedAt.getTime() > recentTtl
        }
        return Date.now() - fetchedAt.getTime() > this.ttl
    }
}
