/**
 * Database-backed CacheStore adapter
 *
 * Factory function that creates a CacheStore<T> backed by Prisma models.
 * Since different data types use different Prisma models, the caller
 * provides findByKey/upsertByKey callbacks that handle the actual DB queries.
 *
 * This is intentionally a thin adapter — tested through service integration
 * rather than standalone unit tests.
 */

import type { CacheEntry, CacheStore } from './types'

interface DbStoreOptions<T, P extends Record<string, unknown> = Record<string, never>> {
    readonly findByKey: (key: string, params?: P) => Promise<{ data: T; fetchedAt: Date } | null>
    readonly upsertByKey: (key: string, data: T, params?: P) => Promise<void>
}

export function createDbStore<T, P extends Record<string, unknown> = Record<string, never>>(
    options: DbStoreOptions<T, P>,
): CacheStore<T, P> {
    return {
        async get(key, params?) {
            const result = await options.findByKey(key, params)
            if (!result) return null
            return { data: result.data, fetchedAt: result.fetchedAt }
        },
        async set(key, data, params?) {
            await options.upsertByKey(key, data, params)
        },
    }
}
