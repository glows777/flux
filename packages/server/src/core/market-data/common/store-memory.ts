import type { CacheEntry, CacheStore } from './types'

export class MemoryStore<
    T,
    P extends Record<string, unknown> = Record<string, never>,
> implements CacheStore<T, P>
{
    private readonly store = new Map<string, CacheEntry<T>>()

    async get(key: string, _params?: P): Promise<CacheEntry<T> | null> {
        return this.store.get(key) ?? null
    }

    async set(key: string, data: T, _params?: P): Promise<void> {
        this.store.set(key, { data, fetchedAt: new Date() })
    }

    clear(): void {
        this.store.clear()
    }
}
