import type { CachedDataSource } from './cached-source'

export interface CoverageStore {
    getCoveredFrom(key: string): Promise<Date | null>
    updateCoveredFrom(key: string, from: Date): Promise<void>
}

export interface CoveredDataSource<T> {
    get(key: string, options: { days: number }): Promise<T>
}

/**
 * Range-based coverage tracking for history data.
 *
 * Wraps a CachedDataSource to detect when a request's date range
 * exceeds what has been previously cached, triggering a fresh fetch.
 * The `{ days }` option is forwarded to the underlying store so that
 * the DB query can apply a date-range filter instead of returning all rows.
 */
export function withCoverage<
    T,
    P extends Record<string, unknown> = Record<string, never>,
>(
    source: CachedDataSource<T, P>,
    coverageStore: CoverageStore,
): CoveredDataSource<T> {
    return {
        async get(key: string, options: { days: number }): Promise<T> {
            const requestedFrom = new Date(
                Date.now() - options.days * 24 * 60 * 60 * 1000,
            )
            const coveredFrom = await coverageStore.getCoveredFrom(key)
            const hasUncoveredRange =
                coveredFrom === null || requestedFrom < coveredFrom

            if (hasUncoveredRange) {
                const fresh = await source.forceFetch(key)
                // hasUncoveredRange guarantees: coveredFrom === null OR requestedFrom < coveredFrom
                // In both cases, requestedFrom is the correct new boundary.
                const newFrom =
                    coveredFrom === null ? requestedFrom : requestedFrom
                await coverageStore.updateCoveredFrom(key, newFrom)
                return fresh
            }

            // Coverage is satisfied — read from cache with params so the
            // store can apply date-range filtering (e.g. history).
            return source.get(key, options as unknown as P)
        },
    }
}
