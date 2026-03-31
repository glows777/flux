/**
 * Task 04: Cache Query Functions Unit Tests
 *
 * Tests for queryLatestEarningsL1FromCache and queryUpcomingEarningsFromCache.
 * These functions only read from DB cache — no external API calls.
 */

import { describe, expect, it } from 'bun:test'
import type { BriefCacheQueryDeps } from '@/core/finance/cache'
import { queryLatestEarningsL1FromCache, queryLatestEarningsL1BatchFromCache, queryUpcomingEarningsFromCache } from '@/core/finance/cache'
import type { EarningsL1 } from '@/core/finance/types'

// ─── Mock Data ───

const MOCK_L1: EarningsL1 = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    period: 'FY2024 Q4',
    reportDate: '2024-12-15',
    beatMiss: {
        revenue: { actual: 120_000_000_000, expected: 118_000_000_000 },
        eps: { actual: 2.1, expected: 2.0 },
    },
    margins: [
        { quarter: 'Q4 2024', gross: 46.5, operating: 31.5, net: 25.1 },
    ],
    keyFinancials: {
        revenue: 120_000_000_000,
        revenueYoY: 6.3,
        operatingIncome: 37_800_000_000,
        fcf: 28_000_000_000,
        debtToAssets: 31.5,
    },
}

const MOCK_L1_OLDER: EarningsL1 = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    period: 'FY2024 Q3',
    reportDate: '2024-09-28',
    beatMiss: { revenue: null, eps: null },
    margins: [],
    keyFinancials: {
        revenue: 94_930_000_000,
        revenueYoY: 5.2,
        operatingIncome: 29_592_000_000,
        fcf: null,
        debtToAssets: null,
    },
}

// ─── Helpers ───

function makeDeps(overrides: {
    findFirst?: (...args: unknown[]) => Promise<unknown>
    findMany?: (...args: unknown[]) => Promise<unknown[]>
} = {}): BriefCacheQueryDeps {
    return {
        db: {
            earningsCache: {
                findFirst: overrides.findFirst ?? (async () => null),
                findMany: overrides.findMany ?? (async () => []),
            },
        },
    } as BriefCacheQueryDeps
}

function daysFromNow(days: number): Date {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(0, 0, 0, 0)
    return d
}

// ─── queryLatestEarningsL1FromCache ───

describe('queryLatestEarningsL1FromCache', () => {
    it('returns latest L1 data when cache exists', async () => {
        const deps = makeDeps({
            findFirst: async () => ({ content: JSON.stringify(MOCK_L1) }),
        })

        const result = await queryLatestEarningsL1FromCache('AAPL', deps)

        expect(result).not.toBeNull()
        expect(result!.symbol).toBe('AAPL')
        expect(result!.period).toBe('FY2024 Q4')
        expect(result!.name).toBe('Apple Inc.')
    })

    it('returns null when no cache exists', async () => {
        const deps = makeDeps({
            findFirst: async () => null,
        })

        const result = await queryLatestEarningsL1FromCache('UNKNOWN', deps)

        expect(result).toBeNull()
    })

    it('returns null when JSON is invalid', async () => {
        const deps = makeDeps({
            findFirst: async () => ({ content: 'not valid json!!!' }),
        })

        const result = await queryLatestEarningsL1FromCache('AAPL', deps)

        expect(result).toBeNull()
    })

    it('returns null when JSON is missing required keys', async () => {
        const deps = makeDeps({
            findFirst: async () => ({ content: JSON.stringify({ foo: 'bar' }) }),
        })

        const result = await queryLatestEarningsL1FromCache('AAPL', deps)

        expect(result).toBeNull()
    })

    it('queries with correct parameters (symbol, type L1, orderBy desc)', async () => {
        let capturedArgs: unknown = null
        const deps = makeDeps({
            findFirst: async (args: unknown) => {
                capturedArgs = args
                return null
            },
        })

        await queryLatestEarningsL1FromCache('TSLA', deps)

        expect(capturedArgs).toEqual({
            where: { symbol: 'TSLA', type: 'L1' },
            orderBy: { reportDate: 'desc' },
            select: { content: true },
        })
    })
})

// ─── queryLatestEarningsL1BatchFromCache ───

describe('queryLatestEarningsL1BatchFromCache', () => {
    it('returns Map with L1 data for multiple symbols in a single query', async () => {
        const mockMsftL1: EarningsL1 = {
            ...MOCK_L1,
            symbol: 'MSFT',
            name: 'Microsoft',
            period: 'FY2024 Q2',
        }
        const deps = makeDeps({
            findMany: async () => [
                { symbol: 'AAPL', content: JSON.stringify(MOCK_L1) },
                { symbol: 'MSFT', content: JSON.stringify(mockMsftL1) },
            ],
        })

        const result = await queryLatestEarningsL1BatchFromCache(['AAPL', 'MSFT'], deps)

        expect(result.size).toBe(2)
        expect(result.get('AAPL')!.symbol).toBe('AAPL')
        expect(result.get('MSFT')!.symbol).toBe('MSFT')
    })

    it('returns empty Map for empty symbols list', async () => {
        const deps = makeDeps()

        const result = await queryLatestEarningsL1BatchFromCache([], deps)

        expect(result.size).toBe(0)
    })

    it('fills null for symbols not found in cache', async () => {
        const deps = makeDeps({
            findMany: async () => [
                { symbol: 'AAPL', content: JSON.stringify(MOCK_L1) },
            ],
        })

        const result = await queryLatestEarningsL1BatchFromCache(['AAPL', 'UNKNOWN'], deps)

        expect(result.size).toBe(2)
        expect(result.get('AAPL')).not.toBeNull()
        expect(result.get('UNKNOWN')).toBeNull()
    })

    it('keeps only the first (latest) row per symbol', async () => {
        const deps = makeDeps({
            findMany: async () => [
                { symbol: 'AAPL', content: JSON.stringify(MOCK_L1) },         // Q4 (latest)
                { symbol: 'AAPL', content: JSON.stringify(MOCK_L1_OLDER) },   // Q3 (older)
            ],
        })

        const result = await queryLatestEarningsL1BatchFromCache(['AAPL'], deps)

        expect(result.get('AAPL')!.period).toBe('FY2024 Q4')
    })

    it('returns null for symbols with invalid JSON content', async () => {
        const deps = makeDeps({
            findMany: async () => [
                { symbol: 'AAPL', content: 'broken json{{{' },
                { symbol: 'MSFT', content: JSON.stringify({ ...MOCK_L1, symbol: 'MSFT' }) },
            ],
        })

        const result = await queryLatestEarningsL1BatchFromCache(['AAPL', 'MSFT'], deps)

        expect(result.get('AAPL')).toBeNull()
        expect(result.get('MSFT')).not.toBeNull()
    })

    it('queries with correct parameters (symbols in, type L1, orderBy desc)', async () => {
        let capturedArgs: unknown = null
        const deps = makeDeps({
            findMany: async (args: unknown) => {
                capturedArgs = args
                return []
            },
        })

        await queryLatestEarningsL1BatchFromCache(['AAPL', 'TSLA'], deps)

        const args = capturedArgs as Record<string, unknown>
        expect(args).toHaveProperty('where')
        expect(args).toHaveProperty('orderBy', { reportDate: 'desc' })
        expect(args).toHaveProperty('select', { symbol: true, content: true })

        const where = (args as { where: Record<string, unknown> }).where
        expect(where.symbol).toEqual({ in: ['AAPL', 'TSLA'] })
        expect(where.type).toBe('L1')
    })
})

// ─── queryUpcomingEarningsFromCache ───

describe('queryUpcomingEarningsFromCache', () => {
    it('returns upcoming earnings for multiple symbols', async () => {
        const futureDate = daysFromNow(7)
        const deps = makeDeps({
            findMany: async () => [
                {
                    symbol: 'AAPL',
                    reportDate: futureDate,
                    content: JSON.stringify(MOCK_L1),
                },
            ],
        })

        const result = await queryUpcomingEarningsFromCache(['AAPL', 'MSFT'], 14, deps)

        expect(result).toHaveLength(1)
        expect(result[0].symbol).toBe('AAPL')
        expect(result[0].name).toBe('Apple Inc.')
        expect(result[0].event).toBe('FY2024 Q4 财报')
        expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('returns empty array for empty symbols list', async () => {
        const deps = makeDeps()

        const result = await queryUpcomingEarningsFromCache([], 14, deps)

        expect(result).toEqual([])
    })

    it('calculates daysAway correctly', async () => {
        const futureDate = daysFromNow(7)
        const deps = makeDeps({
            findMany: async () => [
                {
                    symbol: 'AAPL',
                    reportDate: futureDate,
                    content: JSON.stringify(MOCK_L1),
                },
            ],
        })

        const result = await queryUpcomingEarningsFromCache(['AAPL'], 14, deps)

        expect(result).toHaveLength(1)
        // daysAway should be ~7 (ceil), allow ±1 for test timing
        expect(result[0].daysAway).toBeGreaterThanOrEqual(6)
        expect(result[0].daysAway).toBeLessThanOrEqual(8)
    })

    it('formats event correctly from L1 period', async () => {
        const mockL1WithPeriod = { ...MOCK_L1, period: 'Q4 2024' }
        const futureDate = daysFromNow(5)
        const deps = makeDeps({
            findMany: async () => [
                {
                    symbol: 'AAPL',
                    reportDate: futureDate,
                    content: JSON.stringify(mockL1WithPeriod),
                },
            ],
        })

        const result = await queryUpcomingEarningsFromCache(['AAPL'], 14, deps)

        expect(result[0].event).toBe('Q4 2024 财报')
    })

    it('queries with correct parameters (symbols, date range, orderBy asc)', async () => {
        let capturedArgs: unknown = null
        const deps = makeDeps({
            findMany: async (args: unknown) => {
                capturedArgs = args
                return []
            },
        })

        await queryUpcomingEarningsFromCache(['AAPL', 'MSFT'], 14, deps)

        const args = capturedArgs as Record<string, unknown>
        expect(args).toHaveProperty('where')
        expect(args).toHaveProperty('orderBy', { reportDate: 'asc' })
        expect(args).toHaveProperty('select')

        const where = (args as { where: Record<string, unknown> }).where
        expect(where.symbol).toEqual({ in: ['AAPL', 'MSFT'] })
        expect(where.type).toBe('L1')
        expect(where.reportDate).toHaveProperty('gte')
        expect(where.reportDate).toHaveProperty('lte')
    })

    it('skips rows with invalid JSON content', async () => {
        const futureDate = daysFromNow(3)
        const deps = makeDeps({
            findMany: async () => [
                {
                    symbol: 'AAPL',
                    reportDate: futureDate,
                    content: 'broken json{{{',
                },
                {
                    symbol: 'MSFT',
                    reportDate: futureDate,
                    content: JSON.stringify({
                        ...MOCK_L1,
                        symbol: 'MSFT',
                        name: 'Microsoft',
                        period: 'FY2024 Q2',
                    }),
                },
            ],
        })

        const result = await queryUpcomingEarningsFromCache(['AAPL', 'MSFT'], 14, deps)

        // Only MSFT should be returned (AAPL has invalid JSON)
        expect(result).toHaveLength(1)
        expect(result[0].symbol).toBe('MSFT')
    })

    it('returns results sorted by reportDate ascending', async () => {
        const date3 = daysFromNow(3)
        const date10 = daysFromNow(10)
        const deps = makeDeps({
            findMany: async () => [
                {
                    symbol: 'MSFT',
                    reportDate: date3,
                    content: JSON.stringify({ ...MOCK_L1, symbol: 'MSFT', name: 'Microsoft', period: 'FY2024 Q2' }),
                },
                {
                    symbol: 'AAPL',
                    reportDate: date10,
                    content: JSON.stringify(MOCK_L1),
                },
            ],
        })

        const result = await queryUpcomingEarningsFromCache(['AAPL', 'MSFT'], 14, deps)

        expect(result).toHaveLength(2)
        // DB already returns sorted, so result should maintain order
        expect(result[0].symbol).toBe('MSFT')
        expect(result[1].symbol).toBe('AAPL')
        expect(result[0].daysAway).toBeLessThan(result[1].daysAway)
    })
})
