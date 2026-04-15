import { describe, expect, mock, test } from 'bun:test'
import { CachedDataSource } from '@/core/market-data/common/cached-source'
import {
    type CoverageStore,
    withCoverage,
} from '@/core/market-data/common/coverage'
import { MemoryStore } from '@/core/market-data/common/store-memory'

describe('withCoverage', () => {
    function createMockCoverageStore(): CoverageStore & {
        coveredFrom: Map<string, Date>
    } {
        const coveredFrom = new Map<string, Date>()
        return {
            coveredFrom,
            getCoveredFrom: mock(
                async (key: string) => coveredFrom.get(key) ?? null,
            ),
            updateCoveredFrom: mock(async (key: string, from: Date) => {
                coveredFrom.set(key, from)
            }),
        }
    }

    test('triggers fetch when no coverage exists', async () => {
        const fetchFn = mock(async () => 'fresh-data')
        const source = new CachedDataSource({
            store: new MemoryStore<string>(),
            fetchFn,
            ttl: 60_000,
        })
        const coverageStore = createMockCoverageStore()
        const covered = withCoverage(source, coverageStore)

        const result = await covered.get('AAPL', { days: 30 })
        expect(result).toBe('fresh-data')
        expect(coverageStore.updateCoveredFrom).toHaveBeenCalled()
    })

    test('triggers fetch when requested range exceeds coverage', async () => {
        const fetchFn = mock(async () => 'expanded-data')
        const store = new MemoryStore<string>()
        await store.set('AAPL', 'cached')
        const source = new CachedDataSource({ store, fetchFn, ttl: 60_000 })

        const coverageStore = createMockCoverageStore()
        coverageStore.coveredFrom.set(
            'AAPL',
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        )

        const covered = withCoverage(source, coverageStore)
        const result = await covered.get('AAPL', { days: 365 })
        expect(result).toBe('expanded-data')
        expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    test('returns cached when within coverage', async () => {
        const fetchFn = mock(async () => 'fresh')
        const store = new MemoryStore<string>()
        await store.set('AAPL', 'cached')
        const source = new CachedDataSource({ store, fetchFn, ttl: 60_000 })

        const coverageStore = createMockCoverageStore()
        coverageStore.coveredFrom.set(
            'AAPL',
            new Date(Date.now() - 730 * 24 * 60 * 60 * 1000),
        )

        const covered = withCoverage(source, coverageStore)
        const result = await covered.get('AAPL', { days: 30 })
        expect(result).toBe('cached')
        expect(fetchFn).toHaveBeenCalledTimes(0)
    })
})
