/**
 * Phase 3 Step 4: Cache Layer Unit Tests
 *
 * Test scenarios:
 * - getL1WithCache:
 *   - Cache miss → fetches L1, upserts DB, returns fresh data (cached=false)
 *   - Cache hit (valid, not expired) → returns cached data (cached=true)
 *   - Cache expired (reportDate + 100d < now) → re-fetches, upserts
 *   - Force refresh → bypasses cache, re-fetches
 *   - Default year/quarter → uses current quarter
 *   - Error propagation from L1 service and DB
 *   - Invalid JSON in cache → treats as miss, re-fetches
 *
 * - getL2WithCache:
 *   - Cache miss → fetches L2, upserts DB, returns fresh data
 *   - Cache hit → returns cached data
 *   - Cache expired → re-fetches
 *   - Force refresh → bypasses cache
 *   - reportDate comes from l1Data.reportDate
 *   - Error propagation from L2 service and DB
 *   - Invalid JSON in cache → treats as miss, re-fetches
 */

import { describe, expect, it } from 'bun:test'
import type { L1CacheDeps, L2CacheDeps, QuartersCacheDeps, EarningsCacheRecord } from '@/core/finance/cache'
import { getL1WithCache, getL2WithCache, getQuartersWithCache } from '@/core/finance/cache'
import type { EarningsL1, EarningsL2, FiscalQuarter } from '@/core/finance/types'
import { FmpError } from '@/core/finance/types'

// ─── Mock Data ───

const MOCK_L1: EarningsL1 = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    period: 'FY2024 Q3',
    reportDate: '2024-09-28',
    beatMiss: {
        revenue: null,
        eps: { actual: 1.64, expected: 1.58 },
    },
    margins: [
        { quarter: 'Q3 2024', gross: 46.2, operating: 31.2, net: 24.9 },
    ],
    keyFinancials: {
        revenue: 94_930_000_000,
        revenueYoY: 5.2,
        operatingIncome: 29_592_000_000,
        fcf: 26_000_000_000,
        debtToAssets: 32.1,
    },
}

const MOCK_L2: EarningsL2 = {
    symbol: 'AAPL',
    period: 'FY2024 Q3',
    tldr: 'Apple Q3 营收超预期，服务业务持续增长',
    guidance: {
        nextQuarterRevenue: '预计下季度营收约 900 亿美元',
        fullYearAdjustment: '维持',
        keyQuote: 'We expect continued strength in services.',
        signal: '正面',
    },
    segments: [
        { name: 'iPhone', value: '$46.2B', yoy: '+5.3%', comment: 'iPhone 销售稳健增长' },
        { name: 'Services', value: '$24.2B', yoy: '+14.1%', comment: '服务收入创新高' },
    ],
    managementSignals: {
        tone: '乐观',
        keyPhrases: ['record revenue', 'strong demand'],
        quotes: [
            { en: 'We see strong demand for our products.', cn: '我们看到产品有强劲需求。' },
        ],
        analystFocus: ['AI 投入节奏', '服务业务增长'],
    },
    suggestedQuestions: ['Apple 的 AI 战略如何影响未来营收？'],
}

// Recent date that won't be expired (within 100 days)
const RECENT_REPORT_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago

// Old date that is expired (over 100 days)
const EXPIRED_REPORT_DATE = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) // 120 days ago

const CACHED_AT = new Date('2024-10-15T10:30:00Z')

// ─── Helper: create mock cache record ───

function createCacheRecord(data: EarningsL1 | EarningsL2, reportDate: Date): EarningsCacheRecord {
    return {
        content: JSON.stringify(data),
        reportDate,
        createdAt: CACHED_AT,
    }
}

// ─── Helper: tracking mock deps ───

interface CallTracker {
    readonly findCacheCalls: Array<{ symbol: string; quarter: string; type: string }>
    readonly upsertCacheCalls: Array<{
        symbol: string
        quarter: string
        type: string
        content: string
        reportDate: Date
    }>
    readonly l1Calls: Array<{ symbol: string; year?: number; quarter?: number }>
    readonly l2Calls: Array<{
        symbol: string
        year: number
        quarter: number
        l1Data: EarningsL1
    }>
    readonly quartersCalls: Array<{ symbol: string }>
}

function createTracker(): CallTracker {
    return {
        findCacheCalls: [],
        upsertCacheCalls: [],
        l1Calls: [],
        l2Calls: [],
        quartersCalls: [],
    }
}

function createL1Deps(
    tracker: CallTracker,
    overrides?: Partial<L1CacheDeps>,
): L1CacheDeps {
    return {
        findCache: async (symbol, quarter, type) => {
            tracker.findCacheCalls.push({ symbol, quarter, type })
            return null
        },
        upsertCache: async (data) => {
            tracker.upsertCacheCalls.push(data)
        },
        getEarningsL1: async (symbol, year, quarter) => {
            tracker.l1Calls.push({ symbol, year, quarter })
            return MOCK_L1
        },
        ...overrides,
    }
}

function createL2Deps(
    tracker: CallTracker,
    overrides?: Partial<L2CacheDeps>,
): L2CacheDeps {
    return {
        findCache: async (symbol, quarter, type) => {
            tracker.findCacheCalls.push({ symbol, quarter, type })
            return null
        },
        upsertCache: async (data) => {
            tracker.upsertCacheCalls.push(data)
        },
        getEarningsL2: async (symbol, year, quarter, l1Data) => {
            tracker.l2Calls.push({ symbol, year, quarter, l1Data })
            return MOCK_L2
        },
        ...overrides,
    }
}

// ─── Quarters mock data & deps ───

const MOCK_QUARTERS: ReadonlyArray<FiscalQuarter> = [
    { year: 2024, quarter: 3, key: '2024-Q3', label: 'FY2024 Q3 (2024-10-30)', date: '2024-10-30' },
    { year: 2024, quarter: 2, key: '2024-Q2', label: 'FY2024 Q2 (2024-07-31)', date: '2024-07-31' },
    { year: 2024, quarter: 1, key: '2024-Q1', label: 'FY2024 Q1 (2024-04-30)', date: '2024-04-30' },
]

// Within 7d TTL
const RECENT_CREATED_AT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago

// Expired 7d TTL
const EXPIRED_CREATED_AT = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago

function createQuartersDeps(
    tracker: CallTracker,
    overrides?: Partial<QuartersCacheDeps>,
): QuartersCacheDeps {
    return {
        findCache: async (symbol, quarter, type) => {
            tracker.findCacheCalls.push({ symbol, quarter, type })
            return null
        },
        upsertCache: async (data) => {
            tracker.upsertCacheCalls.push(data)
        },
        getAvailableFiscalQuarters: async (symbol) => {
            tracker.quartersCalls.push({ symbol })
            return MOCK_QUARTERS
        },
        ...overrides,
    }
}

// ─── Tests ───

describe('cache', () => {
    // ────────────────────────────────────────────
    // getL1WithCache
    // ────────────────────────────────────────────

    describe('getL1WithCache', () => {
        describe('cache miss', () => {
            it('fetches L1 data and returns fresh result when cache is empty', async () => {
                const tracker = createTracker()
                const deps = createL1Deps(tracker)

                const result = await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(result.data).toEqual(MOCK_L1)
                expect(result.cached).toBe(false)
                expect(result.cachedAt).toBeNull()
                expect(result.reportDate).toBe(new Date('2024-09-28').toISOString())
            })

            it('calls findCache with correct symbol, quarterKey, and type', async () => {
                const tracker = createTracker()
                const deps = createL1Deps(tracker)

                await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(tracker.findCacheCalls).toHaveLength(1)
                expect(tracker.findCacheCalls[0]).toEqual({
                    symbol: 'AAPL',
                    quarter: '2024-Q3',
                    type: 'L1',
                })
            })

            it('calls getEarningsL1 with symbol, year, and quarter', async () => {
                const tracker = createTracker()
                const deps = createL1Deps(tracker)

                await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(tracker.l1Calls).toHaveLength(1)
                expect(tracker.l1Calls[0]).toEqual({
                    symbol: 'AAPL',
                    year: 2024,
                    quarter: 3,
                })
            })

            it('upserts fresh L1 data to cache with correct fields', async () => {
                const tracker = createTracker()
                const deps = createL1Deps(tracker)

                await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(tracker.upsertCacheCalls).toHaveLength(1)
                const upserted = tracker.upsertCacheCalls[0]
                expect(upserted.symbol).toBe('AAPL')
                expect(upserted.quarter).toBe('2024-Q3')
                expect(upserted.type).toBe('L1')
                expect(JSON.parse(upserted.content)).toEqual(MOCK_L1)
                expect(upserted.reportDate).toEqual(new Date('2024-09-28'))
            })
        })

        describe('cache hit', () => {
            it('returns cached data without calling L1 service', async () => {
                const tracker = createTracker()
                const cacheRecord = createCacheRecord(MOCK_L1, RECENT_REPORT_DATE)
                const deps = createL1Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return cacheRecord
                    },
                })

                const result = await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(result.data).toEqual(MOCK_L1)
                expect(result.cached).toBe(true)
                expect(result.cachedAt).toBe(CACHED_AT.toISOString())
                expect(tracker.l1Calls).toHaveLength(0)
                expect(tracker.upsertCacheCalls).toHaveLength(0)
            })

            it('includes reportDate from cache record', async () => {
                const tracker = createTracker()
                const cacheRecord = createCacheRecord(MOCK_L1, RECENT_REPORT_DATE)
                const deps = createL1Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return cacheRecord
                    },
                })

                const result = await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(result.reportDate).toBe(RECENT_REPORT_DATE.toISOString())
            })
        })

        describe('cache expired', () => {
            it('re-fetches when reportDate + 100d < now', async () => {
                const tracker = createTracker()
                const expiredRecord = createCacheRecord(MOCK_L1, EXPIRED_REPORT_DATE)
                const deps = createL1Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return expiredRecord
                    },
                })

                const result = await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(result.cached).toBe(false)
                expect(result.cachedAt).toBeNull()
                expect(tracker.l1Calls).toHaveLength(1)
                expect(tracker.upsertCacheCalls).toHaveLength(1)
            })
        })

        describe('force refresh', () => {
            it('bypasses valid cache when forceRefresh is true', async () => {
                const tracker = createTracker()
                const cacheRecord = createCacheRecord(MOCK_L1, RECENT_REPORT_DATE)
                const deps = createL1Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return cacheRecord
                    },
                })

                const result = await getL1WithCache('AAPL', 2024, 3, true, deps)

                expect(result.cached).toBe(false)
                expect(result.cachedAt).toBeNull()
                expect(tracker.l1Calls).toHaveLength(1)
                expect(tracker.upsertCacheCalls).toHaveLength(1)
            })

            it('does not call findCache when forceRefresh is true', async () => {
                const tracker = createTracker()
                const deps = createL1Deps(tracker)

                await getL1WithCache('AAPL', 2024, 3, true, deps)

                expect(tracker.findCacheCalls).toHaveLength(0)
                expect(tracker.l1Calls).toHaveLength(1)
            })
        })

        describe('default quarter', () => {
            it('uses current quarter when year and quarter are not provided', async () => {
                const tracker = createTracker()
                const deps = createL1Deps(tracker)

                const result = await getL1WithCache('AAPL', undefined, undefined, false, deps)

                expect(result.data).toEqual(MOCK_L1)
                // Should still have called findCache and L1 service
                expect(tracker.findCacheCalls).toHaveLength(1)
                expect(tracker.l1Calls).toHaveLength(1)

                // Quarter key should match current quarter
                const now = new Date()
                const currentQ = Math.floor(now.getMonth() / 3) + 1
                const expectedKey = `${now.getFullYear()}-Q${currentQ}`
                expect(tracker.findCacheCalls[0].quarter).toBe(expectedKey)
            })

            it('passes year and quarter through to L1 service', async () => {
                const tracker = createTracker()
                const deps = createL1Deps(tracker)

                await getL1WithCache('AAPL', undefined, undefined, false, deps)

                const now = new Date()
                const currentQ = Math.floor(now.getMonth() / 3) + 1
                expect(tracker.l1Calls[0].year).toBe(now.getFullYear())
                expect(tracker.l1Calls[0].quarter).toBe(currentQ)
            })
        })

        describe('error handling', () => {
            it('propagates FmpError from L1 service', async () => {
                const tracker = createTracker()
                const deps = createL1Deps(tracker, {
                    getEarningsL1: async () => {
                        throw new FmpError('FMP rate limited', 'RATE_LIMITED')
                    },
                })

                await expect(getL1WithCache('AAPL', 2024, 3, false, deps))
                    .rejects.toThrow(FmpError)

                try {
                    await getL1WithCache('AAPL', 2024, 3, false, deps)
                } catch (error) {
                    expect(error).toBeInstanceOf(FmpError)
                    expect((error as FmpError).code).toBe('RATE_LIMITED')
                }
            })

            it('propagates error from findCache', async () => {
                const tracker = createTracker()
                const deps = createL1Deps(tracker, {
                    findCache: async () => {
                        throw new Error('DB connection failed')
                    },
                })

                await expect(getL1WithCache('AAPL', 2024, 3, false, deps))
                    .rejects.toThrow('DB connection failed')
            })

            it('propagates error from upsertCache', async () => {
                const tracker = createTracker()
                const deps = createL1Deps(tracker, {
                    upsertCache: async () => {
                        throw new Error('DB write failed')
                    },
                })

                await expect(getL1WithCache('AAPL', 2024, 3, false, deps))
                    .rejects.toThrow('DB write failed')
            })

            it('re-fetches when cached content is invalid JSON', async () => {
                const tracker = createTracker()
                const corruptRecord: EarningsCacheRecord = {
                    content: 'not valid json {{{',
                    reportDate: RECENT_REPORT_DATE,
                    createdAt: CACHED_AT,
                }
                const deps = createL1Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return corruptRecord
                    },
                })

                const result = await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(result.cached).toBe(false)
                expect(result.data).toEqual(MOCK_L1)
                expect(tracker.l1Calls).toHaveLength(1)
                expect(tracker.upsertCacheCalls).toHaveLength(1)
            })

            it('re-fetches when cached content is valid JSON but missing required keys', async () => {
                const tracker = createTracker()
                const wrongShapeRecord: EarningsCacheRecord = {
                    content: JSON.stringify({ foo: 'bar', baz: 123 }),
                    reportDate: RECENT_REPORT_DATE,
                    createdAt: CACHED_AT,
                }
                const deps = createL1Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return wrongShapeRecord
                    },
                })

                const result = await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(result.cached).toBe(false)
                expect(result.data).toEqual(MOCK_L1)
                expect(tracker.l1Calls).toHaveLength(1)
            })

            it('re-fetches when cached content is a JSON array', async () => {
                const tracker = createTracker()
                const arrayRecord: EarningsCacheRecord = {
                    content: JSON.stringify([1, 2, 3]),
                    reportDate: RECENT_REPORT_DATE,
                    createdAt: CACHED_AT,
                }
                const deps = createL1Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return arrayRecord
                    },
                })

                const result = await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(result.cached).toBe(false)
                expect(tracker.l1Calls).toHaveLength(1)
            })

            it('re-fetches when cached content is a JSON primitive', async () => {
                const tracker = createTracker()
                const primitiveRecord: EarningsCacheRecord = {
                    content: '"just a string"',
                    reportDate: RECENT_REPORT_DATE,
                    createdAt: CACHED_AT,
                }
                const deps = createL1Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return primitiveRecord
                    },
                })

                const result = await getL1WithCache('AAPL', 2024, 3, false, deps)

                expect(result.cached).toBe(false)
                expect(tracker.l1Calls).toHaveLength(1)
            })
        })
    })

    // ────────────────────────────────────────────
    // getL2WithCache
    // ────────────────────────────────────────────

    describe('getL2WithCache', () => {
        describe('cache miss', () => {
            it('fetches L2 data and returns fresh result when cache is empty', async () => {
                const tracker = createTracker()
                const deps = createL2Deps(tracker)

                const result = await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)

                expect(result.data).toEqual(MOCK_L2)
                expect(result.cached).toBe(false)
                expect(result.cachedAt).toBeNull()
            })

            it('calls findCache with correct symbol, quarterKey, and type', async () => {
                const tracker = createTracker()
                const deps = createL2Deps(tracker)

                await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)

                expect(tracker.findCacheCalls).toHaveLength(1)
                expect(tracker.findCacheCalls[0]).toEqual({
                    symbol: 'AAPL',
                    quarter: '2024-Q3',
                    type: 'L2',
                })
            })

            it('calls getEarningsL2 with symbol, year, quarter, and l1Data', async () => {
                const tracker = createTracker()
                const deps = createL2Deps(tracker)

                await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)

                expect(tracker.l2Calls).toHaveLength(1)
                expect(tracker.l2Calls[0]).toEqual({
                    symbol: 'AAPL',
                    year: 2024,
                    quarter: 3,
                    l1Data: MOCK_L1,
                })
            })

            it('upserts with reportDate from l1Data.reportDate', async () => {
                const tracker = createTracker()
                const deps = createL2Deps(tracker)

                await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)

                expect(tracker.upsertCacheCalls).toHaveLength(1)
                const upserted = tracker.upsertCacheCalls[0]
                expect(upserted.symbol).toBe('AAPL')
                expect(upserted.quarter).toBe('2024-Q3')
                expect(upserted.type).toBe('L2')
                expect(JSON.parse(upserted.content)).toEqual(MOCK_L2)
                // reportDate should come from l1Data.reportDate
                expect(upserted.reportDate).toEqual(new Date(MOCK_L1.reportDate))
            })

            it('returns reportDate from l1Data as ISO string', async () => {
                const tracker = createTracker()
                const deps = createL2Deps(tracker)

                const result = await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)

                expect(result.reportDate).toBe(new Date(MOCK_L1.reportDate).toISOString())
            })
        })

        describe('cache hit', () => {
            it('returns cached data without calling L2 service', async () => {
                const tracker = createTracker()
                const cacheRecord = createCacheRecord(MOCK_L2, RECENT_REPORT_DATE)
                const deps = createL2Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return cacheRecord
                    },
                })

                const result = await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)

                expect(result.data).toEqual(MOCK_L2)
                expect(result.cached).toBe(true)
                expect(result.cachedAt).toBe(CACHED_AT.toISOString())
                expect(tracker.l2Calls).toHaveLength(0)
                expect(tracker.upsertCacheCalls).toHaveLength(0)
            })

            it('includes reportDate from cache record', async () => {
                const tracker = createTracker()
                const cacheRecord = createCacheRecord(MOCK_L2, RECENT_REPORT_DATE)
                const deps = createL2Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return cacheRecord
                    },
                })

                const result = await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)

                expect(result.reportDate).toBe(RECENT_REPORT_DATE.toISOString())
            })
        })

        describe('cache expired', () => {
            it('re-fetches when reportDate + 100d < now', async () => {
                const tracker = createTracker()
                const expiredRecord = createCacheRecord(MOCK_L2, EXPIRED_REPORT_DATE)
                const deps = createL2Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return expiredRecord
                    },
                })

                const result = await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)

                expect(result.cached).toBe(false)
                expect(result.cachedAt).toBeNull()
                expect(tracker.l2Calls).toHaveLength(1)
                expect(tracker.upsertCacheCalls).toHaveLength(1)
            })
        })

        describe('force refresh', () => {
            it('bypasses valid cache when forceRefresh is true', async () => {
                const tracker = createTracker()
                const cacheRecord = createCacheRecord(MOCK_L2, RECENT_REPORT_DATE)
                const deps = createL2Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return cacheRecord
                    },
                })

                const result = await getL2WithCache('AAPL', 2024, 3, MOCK_L1, true, deps)

                expect(result.cached).toBe(false)
                expect(tracker.l2Calls).toHaveLength(1)
                expect(tracker.upsertCacheCalls).toHaveLength(1)
            })

            it('does not call findCache when forceRefresh is true', async () => {
                const tracker = createTracker()
                const deps = createL2Deps(tracker)

                await getL2WithCache('AAPL', 2024, 3, MOCK_L1, true, deps)

                expect(tracker.findCacheCalls).toHaveLength(0)
                expect(tracker.l2Calls).toHaveLength(1)
            })
        })

        describe('error handling', () => {
            it('propagates FmpError from L2 service', async () => {
                const tracker = createTracker()
                const deps = createL2Deps(tracker, {
                    getEarningsL2: async () => {
                        throw new FmpError('No transcript found', 'NOT_FOUND')
                    },
                })

                await expect(getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps))
                    .rejects.toThrow(FmpError)

                try {
                    await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)
                } catch (error) {
                    expect(error).toBeInstanceOf(FmpError)
                    expect((error as FmpError).code).toBe('NOT_FOUND')
                }
            })

            it('propagates error from findCache', async () => {
                const tracker = createTracker()
                const deps = createL2Deps(tracker, {
                    findCache: async () => {
                        throw new Error('DB connection failed')
                    },
                })

                await expect(getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps))
                    .rejects.toThrow('DB connection failed')
            })

            it('propagates error from upsertCache', async () => {
                const tracker = createTracker()
                const deps = createL2Deps(tracker, {
                    upsertCache: async () => {
                        throw new Error('DB write failed')
                    },
                })

                await expect(getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps))
                    .rejects.toThrow('DB write failed')
            })

            it('re-fetches when cached content is invalid JSON', async () => {
                const tracker = createTracker()
                const corruptRecord: EarningsCacheRecord = {
                    content: '<<<not json>>>',
                    reportDate: RECENT_REPORT_DATE,
                    createdAt: CACHED_AT,
                }
                const deps = createL2Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return corruptRecord
                    },
                })

                const result = await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)

                expect(result.cached).toBe(false)
                expect(result.data).toEqual(MOCK_L2)
                expect(tracker.l2Calls).toHaveLength(1)
                expect(tracker.upsertCacheCalls).toHaveLength(1)
            })

            it('re-fetches when cached content is valid JSON but missing required keys', async () => {
                const tracker = createTracker()
                // Missing 'tldr' which is required for L2
                const wrongShapeRecord: EarningsCacheRecord = {
                    content: JSON.stringify({ symbol: 'AAPL', period: 'FY2024 Q3' }),
                    reportDate: RECENT_REPORT_DATE,
                    createdAt: CACHED_AT,
                }
                const deps = createL2Deps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return wrongShapeRecord
                    },
                })

                const result = await getL2WithCache('AAPL', 2024, 3, MOCK_L1, false, deps)

                expect(result.cached).toBe(false)
                expect(result.data).toEqual(MOCK_L2)
                expect(tracker.l2Calls).toHaveLength(1)
            })
        })
    })

    // ────────────────────────────────────────────
    // getQuartersWithCache
    // ────────────────────────────────────────────

    describe('getQuartersWithCache', () => {
        describe('cache miss', () => {
            it('fetches quarters and returns fresh result when cache is empty', async () => {
                const tracker = createTracker()
                const deps = createQuartersDeps(tracker)

                const result = await getQuartersWithCache('AAPL', deps)

                expect(result.data).toEqual(MOCK_QUARTERS)
                expect(result.cached).toBe(false)
                expect(result.cachedAt).toBeNull()
            })

            it('calls findCache with symbol, "ALL", and "QUARTERS"', async () => {
                const tracker = createTracker()
                const deps = createQuartersDeps(tracker)

                await getQuartersWithCache('AAPL', deps)

                expect(tracker.findCacheCalls).toHaveLength(1)
                expect(tracker.findCacheCalls[0]).toEqual({
                    symbol: 'AAPL',
                    quarter: 'ALL',
                    type: 'QUARTERS',
                })
            })

            it('calls getAvailableFiscalQuarters with symbol', async () => {
                const tracker = createTracker()
                const deps = createQuartersDeps(tracker)

                await getQuartersWithCache('AAPL', deps)

                expect(tracker.quartersCalls).toHaveLength(1)
                expect(tracker.quartersCalls[0]).toEqual({ symbol: 'AAPL' })
            })

            it('upserts fresh quarters data with correct fields', async () => {
                const tracker = createTracker()
                const deps = createQuartersDeps(tracker)

                await getQuartersWithCache('AAPL', deps)

                expect(tracker.upsertCacheCalls).toHaveLength(1)
                const upserted = tracker.upsertCacheCalls[0]
                expect(upserted.symbol).toBe('AAPL')
                expect(upserted.quarter).toBe('ALL')
                expect(upserted.type).toBe('QUARTERS')
                expect(JSON.parse(upserted.content)).toEqual(MOCK_QUARTERS)
                expect(upserted.reportDate).toEqual(new Date(MOCK_QUARTERS[0].date))
            })

            it('uses current date as reportDate when quarters array is empty', async () => {
                const tracker = createTracker()
                const before = Date.now()
                const deps = createQuartersDeps(tracker, {
                    getAvailableFiscalQuarters: async (symbol) => {
                        tracker.quartersCalls.push({ symbol })
                        return []
                    },
                })

                await getQuartersWithCache('AAPL', deps)

                const after = Date.now()
                const upserted = tracker.upsertCacheCalls[0]
                expect(upserted.reportDate.getTime()).toBeGreaterThanOrEqual(before)
                expect(upserted.reportDate.getTime()).toBeLessThanOrEqual(after)
            })
        })

        describe('cache hit', () => {
            it('returns cached data without calling FMP service', async () => {
                const tracker = createTracker()
                const cacheRecord: EarningsCacheRecord = {
                    content: JSON.stringify(MOCK_QUARTERS),
                    reportDate: new Date(MOCK_QUARTERS[0].date),
                    createdAt: RECENT_CREATED_AT,
                }
                const deps = createQuartersDeps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return cacheRecord
                    },
                })

                const result = await getQuartersWithCache('AAPL', deps)

                expect(result.data).toEqual(MOCK_QUARTERS)
                expect(result.cached).toBe(true)
                expect(result.cachedAt).toBe(RECENT_CREATED_AT.toISOString())
                expect(tracker.quartersCalls).toHaveLength(0)
                expect(tracker.upsertCacheCalls).toHaveLength(0)
            })
        })

        describe('cache expired (createdAt + 7d)', () => {
            it('re-fetches when createdAt + 7d < now', async () => {
                const tracker = createTracker()
                const expiredRecord: EarningsCacheRecord = {
                    content: JSON.stringify(MOCK_QUARTERS),
                    reportDate: new Date(MOCK_QUARTERS[0].date),
                    createdAt: EXPIRED_CREATED_AT,
                }
                const deps = createQuartersDeps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return expiredRecord
                    },
                })

                const result = await getQuartersWithCache('AAPL', deps)

                expect(result.cached).toBe(false)
                expect(result.cachedAt).toBeNull()
                expect(tracker.quartersCalls).toHaveLength(1)
                expect(tracker.upsertCacheCalls).toHaveLength(1)
            })
        })

        describe('error handling', () => {
            it('propagates FmpError from getAvailableFiscalQuarters', async () => {
                const tracker = createTracker()
                const deps = createQuartersDeps(tracker, {
                    getAvailableFiscalQuarters: async () => {
                        throw new FmpError('FMP rate limited', 'RATE_LIMITED')
                    },
                })

                await expect(getQuartersWithCache('AAPL', deps))
                    .rejects.toThrow(FmpError)

                try {
                    await getQuartersWithCache('AAPL', deps)
                } catch (error) {
                    expect(error).toBeInstanceOf(FmpError)
                    expect((error as FmpError).code).toBe('RATE_LIMITED')
                }
            })

            it('propagates error from findCache', async () => {
                const tracker = createTracker()
                const deps = createQuartersDeps(tracker, {
                    findCache: async () => {
                        throw new Error('DB connection failed')
                    },
                })

                await expect(getQuartersWithCache('AAPL', deps))
                    .rejects.toThrow('DB connection failed')
            })

            it('propagates error from upsertCache', async () => {
                const tracker = createTracker()
                const deps = createQuartersDeps(tracker, {
                    upsertCache: async () => {
                        throw new Error('DB write failed')
                    },
                })

                await expect(getQuartersWithCache('AAPL', deps))
                    .rejects.toThrow('DB write failed')
            })

            it('re-fetches when cached content is invalid JSON', async () => {
                const tracker = createTracker()
                const corruptRecord: EarningsCacheRecord = {
                    content: 'not valid json {{{',
                    reportDate: new Date(MOCK_QUARTERS[0].date),
                    createdAt: RECENT_CREATED_AT,
                }
                const deps = createQuartersDeps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return corruptRecord
                    },
                })

                const result = await getQuartersWithCache('AAPL', deps)

                expect(result.cached).toBe(false)
                expect(result.data).toEqual(MOCK_QUARTERS)
                expect(tracker.quartersCalls).toHaveLength(1)
                expect(tracker.upsertCacheCalls).toHaveLength(1)
            })

            it('re-fetches when cached content is a JSON object (not array)', async () => {
                const tracker = createTracker()
                const objectRecord: EarningsCacheRecord = {
                    content: JSON.stringify({ foo: 'bar' }),
                    reportDate: new Date(MOCK_QUARTERS[0].date),
                    createdAt: RECENT_CREATED_AT,
                }
                const deps = createQuartersDeps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return objectRecord
                    },
                })

                const result = await getQuartersWithCache('AAPL', deps)

                expect(result.cached).toBe(false)
                expect(tracker.quartersCalls).toHaveLength(1)
            })

            it('re-fetches when cached content is a JSON primitive', async () => {
                const tracker = createTracker()
                const primitiveRecord: EarningsCacheRecord = {
                    content: '"just a string"',
                    reportDate: new Date(MOCK_QUARTERS[0].date),
                    createdAt: RECENT_CREATED_AT,
                }
                const deps = createQuartersDeps(tracker, {
                    findCache: async (symbol, quarter, type) => {
                        tracker.findCacheCalls.push({ symbol, quarter, type })
                        return primitiveRecord
                    },
                })

                const result = await getQuartersWithCache('AAPL', deps)

                expect(result.cached).toBe(false)
                expect(tracker.quartersCalls).toHaveLength(1)
            })
        })
    })
})
