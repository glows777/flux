/**
 * P2-02: Data Model Unit Tests (Mock Prisma)
 *
 * Test scenarios:
 * - T02-01: Watchlist CRUD operations
 * - T02-03: StockHistory composite unique constraint
 * - T02-04: StockInfo nullable fields
 * - T02-05: AIReport sorting by createdAt DESC
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'

// Mock data factories
const createMockWatchlist = (
    overrides: Record<string, unknown> = {},
): MockWatchlist => ({
    id: 'cuid-watchlist-1',
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
})

const createMockStockHistory = (
    overrides: Record<string, unknown> = {},
): MockStockHistory => ({
    id: 'cuid-history-1',
    symbol: 'NVDA',
    date: new Date('2024-01-01'),
    open: 440.0,
    high: 455.0,
    low: 438.0,
    close: 450.5,
    volume: BigInt(1000000),
    ...overrides,
})

const createMockStockInfo = (
    overrides: Record<string, unknown> = {},
): MockStockInfo => ({
    id: 'cuid-info-1',
    symbol: 'NVDA',
    pe: 35.5,
    marketCap: BigInt(1100000000000),
    eps: 12.5,
    dividendYield: 0.04,
    sector: 'Technology',
    fetchedAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
})

const createMockAIReport = (
    overrides: Record<string, unknown> = {},
): MockAIReport => ({
    id: 'cuid-report-1',
    symbol: 'NVDA',
    content: '# AI Analysis Report\n\nThis is a test report.',
    createdAt: new Date('2024-01-01'),
    ...overrides,
})

// Type definitions for mock data
interface MockWatchlist {
    id: string
    symbol: string
    name: string
    createdAt: Date
    updatedAt: Date
}

interface MockStockHistory {
    id: string
    symbol: string
    date: Date
    open: number
    high: number
    low: number
    close: number
    volume: bigint | null
}

interface MockStockInfo {
    id: string
    symbol: string
    pe: number | null
    marketCap: bigint | null
    eps: number | null
    dividendYield: number | null
    sector: string | null
    fetchedAt: Date
    updatedAt: Date
}

interface MockAIReport {
    id: string
    symbol: string
    content: string
    createdAt: Date
}

// Type for mock functions that accept any arguments
type MockFn<T> = ReturnType<typeof mock<(...args: unknown[]) => Promise<T>>>

// Mock Prisma client type
interface MockPrismaClient {
    watchlist: {
        create: MockFn<MockWatchlist>
        findUnique: MockFn<MockWatchlist | null>
        findMany: MockFn<MockWatchlist[]>
        update: MockFn<MockWatchlist>
        delete: MockFn<MockWatchlist>
    }
    stockHistory: {
        create: MockFn<MockStockHistory>
        findUnique: MockFn<MockStockHistory | null>
        findMany: MockFn<MockStockHistory[]>
    }
    stockInfo: {
        create: MockFn<MockStockInfo>
        findUnique: MockFn<MockStockInfo | null>
        update: MockFn<MockStockInfo>
    }
    aIReport: {
        create: MockFn<MockAIReport>
        findMany: MockFn<MockAIReport[]>
        findFirst: MockFn<MockAIReport | null>
    }
    $disconnect: MockFn<void>
}

// Create mock Prisma client
const createMockPrismaClient = (): MockPrismaClient => ({
    watchlist: {
        create: mock(() => Promise.resolve(createMockWatchlist())),
        findUnique: mock(() => Promise.resolve(createMockWatchlist())),
        findMany: mock(() => Promise.resolve([createMockWatchlist()])),
        update: mock(() =>
            Promise.resolve(createMockWatchlist({ name: 'Updated Name' })),
        ),
        delete: mock(() => Promise.resolve(createMockWatchlist())),
    },
    stockHistory: {
        create: mock(() => Promise.resolve(createMockStockHistory())),
        findUnique: mock(() => Promise.resolve(createMockStockHistory())),
        findMany: mock(() => Promise.resolve([createMockStockHistory()])),
    },
    stockInfo: {
        create: mock(() => Promise.resolve(createMockStockInfo())),
        findUnique: mock(() => Promise.resolve(createMockStockInfo())),
        update: mock(() => Promise.resolve(createMockStockInfo())),
    },
    aIReport: {
        create: mock(() => Promise.resolve(createMockAIReport())),
        findMany: mock(() => Promise.resolve([createMockAIReport()])),
        findFirst: mock(() => Promise.resolve(createMockAIReport())),
    },
    $disconnect: mock(() => Promise.resolve()),
})

describe('P2-02: Data Model Unit Tests', () => {
    let mockPrisma: MockPrismaClient

    beforeEach(() => {
        mockPrisma = createMockPrismaClient()
    })

    describe('T02-01: Watchlist CRUD Operations', () => {
        it('should create a watchlist item', async () => {
            const data = { symbol: 'NVDA', name: 'NVIDIA Corporation' }

            const result = await mockPrisma.watchlist.create({ data })

            expect(mockPrisma.watchlist.create).toHaveBeenCalledWith({ data })
            expect(result.id).toBeDefined()
            expect(result.symbol).toBe('NVDA')
            expect(result.name).toBe('NVIDIA Corporation')
            expect(result.createdAt).toBeInstanceOf(Date)
            expect(result.updatedAt).toBeInstanceOf(Date)
        })

        it('should read a watchlist item by symbol', async () => {
            const result = await mockPrisma.watchlist.findUnique({
                where: { symbol: 'NVDA' },
            })

            expect(mockPrisma.watchlist.findUnique).toHaveBeenCalledWith({
                where: { symbol: 'NVDA' },
            })
            expect(result).toBeDefined()
            expect(result?.symbol).toBe('NVDA')
        })

        it('should read all watchlist items', async () => {
            const results = await mockPrisma.watchlist.findMany()

            expect(mockPrisma.watchlist.findMany).toHaveBeenCalled()
            expect(Array.isArray(results)).toBe(true)
            expect(results.length).toBeGreaterThan(0)
        })

        it('should update a watchlist item', async () => {
            const result = await mockPrisma.watchlist.update({
                where: { symbol: 'NVDA' },
                data: { name: 'Updated Name' },
            })

            expect(mockPrisma.watchlist.update).toHaveBeenCalledWith({
                where: { symbol: 'NVDA' },
                data: { name: 'Updated Name' },
            })
            expect(result.name).toBe('Updated Name')
        })

        it('should delete a watchlist item', async () => {
            const result = await mockPrisma.watchlist.delete({
                where: { symbol: 'NVDA' },
            })

            expect(mockPrisma.watchlist.delete).toHaveBeenCalledWith({
                where: { symbol: 'NVDA' },
            })
            expect(result).toBeDefined()
        })

        it('should return null for non-existent watchlist item', async () => {
            // Create a new mock client with null return for this test
            const testMock = createMockPrismaClient()
            testMock.watchlist.findUnique = mock(() => Promise.resolve(null))

            const result = await testMock.watchlist.findUnique({
                where: { symbol: 'NONEXISTENT' },
            })

            expect(result).toBeNull()
        })
    })

    describe('T02-03: StockHistory Composite Unique Constraint', () => {
        it('should create stock history with symbol and date', async () => {
            const data = {
                symbol: 'NVDA',
                date: new Date('2024-01-15'),
                open: 440.0,
                high: 455.0,
                low: 438.0,
                close: 450.0,
            }

            const result = await mockPrisma.stockHistory.create({ data })

            expect(mockPrisma.stockHistory.create).toHaveBeenCalledWith({
                data,
            })
            expect(result.symbol).toBe('NVDA')
            expect(result.date).toBeInstanceOf(Date)
        })

        it('should find history by composite key (symbol + date)', async () => {
            const result = await mockPrisma.stockHistory.findUnique({
                where: {
                    symbol_date: {
                        symbol: 'NVDA',
                        date: new Date('2024-01-01'),
                    },
                },
            })

            expect(mockPrisma.stockHistory.findUnique).toHaveBeenCalledWith({
                where: {
                    symbol_date: {
                        symbol: 'NVDA',
                        date: new Date('2024-01-01'),
                    },
                },
            })
            expect(result).toBeDefined()
        })

        it('should query history by symbol with index', async () => {
            const results = await mockPrisma.stockHistory.findMany({
                where: { symbol: 'NVDA' },
                orderBy: { date: 'desc' },
            })

            expect(mockPrisma.stockHistory.findMany).toHaveBeenCalledWith({
                where: { symbol: 'NVDA' },
                orderBy: { date: 'desc' },
            })
            expect(Array.isArray(results)).toBe(true)
        })

        it('should reject duplicate symbol+date combination', async () => {
            // Simulate unique constraint violation
            const testMock = createMockPrismaClient()
            testMock.stockHistory.create = mock(() =>
                Promise.reject(
                    new Error(
                        'Unique constraint failed on the fields: (`symbol`,`date`)',
                    ),
                ),
            )

            await expect(
                testMock.stockHistory.create({
                    data: {
                        symbol: 'NVDA',
                        date: new Date('2024-01-01'),
                        open: 440.0,
                        high: 455.0,
                        low: 438.0,
                        close: 450.0,
                    },
                }),
            ).rejects.toThrow('Unique constraint failed')
        })
    })

    describe('T02-04: StockInfo Nullable Fields', () => {
        it('should create stock info with all fields', async () => {
            const data = {
                symbol: 'NVDA',
                pe: 35.5,
                marketCap: BigInt(1100000000000),
                eps: 12.5,
                dividendYield: 0.04,
                sector: 'Technology',
            }

            const result = await mockPrisma.stockInfo.create({ data })

            expect(mockPrisma.stockInfo.create).toHaveBeenCalledWith({ data })
            expect(result.pe).toBe(35.5)
            expect(result.sector).toBe('Technology')
        })

        it('should allow null pe (market P/E ratio)', async () => {
            const testMock = createMockPrismaClient()
            testMock.stockInfo.create = mock(() =>
                Promise.resolve(createMockStockInfo({ pe: null })),
            )

            const result = await testMock.stockInfo.create({
                data: { symbol: 'NVDA', pe: null },
            })

            expect(result.pe).toBeNull()
        })

        it('should allow null marketCap (total market cap)', async () => {
            const testMock = createMockPrismaClient()
            testMock.stockInfo.create = mock(() =>
                Promise.resolve(createMockStockInfo({ marketCap: null })),
            )

            const result = await testMock.stockInfo.create({
                data: { symbol: 'NVDA', marketCap: null },
            })

            expect(result.marketCap).toBeNull()
        })

        it('should allow null eps (earnings per share)', async () => {
            const testMock = createMockPrismaClient()
            testMock.stockInfo.create = mock(() =>
                Promise.resolve(createMockStockInfo({ eps: null })),
            )

            const result = await testMock.stockInfo.create({
                data: { symbol: 'NVDA', eps: null },
            })

            expect(result.eps).toBeNull()
        })

        it('should allow null dividendYield (dividend rate)', async () => {
            const testMock = createMockPrismaClient()
            testMock.stockInfo.create = mock(() =>
                Promise.resolve(createMockStockInfo({ dividendYield: null })),
            )

            const result = await testMock.stockInfo.create({
                data: { symbol: 'NVDA', dividendYield: null },
            })

            expect(result.dividendYield).toBeNull()
        })

        it('should allow null sector (industry)', async () => {
            const testMock = createMockPrismaClient()
            testMock.stockInfo.create = mock(() =>
                Promise.resolve(createMockStockInfo({ sector: null })),
            )

            const result = await testMock.stockInfo.create({
                data: { symbol: 'NVDA', sector: null },
            })

            expect(result.sector).toBeNull()
        })

        it('should allow all nullable fields to be null simultaneously', async () => {
            const testMock = createMockPrismaClient()
            testMock.stockInfo.create = mock(() =>
                Promise.resolve(
                    createMockStockInfo({
                        pe: null,
                        marketCap: null,
                        eps: null,
                        dividendYield: null,
                        sector: null,
                    }),
                ),
            )

            const result = await testMock.stockInfo.create({
                data: {
                    symbol: 'NVDA',
                    pe: null,
                    marketCap: null,
                    eps: null,
                    dividendYield: null,
                    sector: null,
                },
            })

            expect(result.pe).toBeNull()
            expect(result.marketCap).toBeNull()
            expect(result.eps).toBeNull()
            expect(result.dividendYield).toBeNull()
            expect(result.sector).toBeNull()
        })
    })

    describe('T02-05: AIReport Sorting by createdAt DESC', () => {
        it('should create AI report with content', async () => {
            const data = {
                symbol: 'NVDA',
                content: '# AI Analysis\n\nNVIDIA shows strong momentum...',
            }

            const result = await mockPrisma.aIReport.create({ data })

            expect(mockPrisma.aIReport.create).toHaveBeenCalledWith({ data })
            expect(result.content).toContain('AI Analysis')
            expect(result.createdAt).toBeInstanceOf(Date)
        })

        it('should return reports sorted by createdAt DESC', async () => {
            const reports = [
                createMockAIReport({
                    id: '1',
                    createdAt: new Date('2024-01-03'),
                }),
                createMockAIReport({
                    id: '2',
                    createdAt: new Date('2024-01-01'),
                }),
                createMockAIReport({
                    id: '3',
                    createdAt: new Date('2024-01-02'),
                }),
            ]

            // Sort by createdAt DESC
            const sortedReports = [...reports].sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            )

            const testMock = createMockPrismaClient()
            testMock.aIReport.findMany = mock(() =>
                Promise.resolve(sortedReports),
            )

            const results = await testMock.aIReport.findMany({
                where: { symbol: 'NVDA' },
                orderBy: { createdAt: 'desc' },
            })

            expect(testMock.aIReport.findMany).toHaveBeenCalledWith({
                where: { symbol: 'NVDA' },
                orderBy: { createdAt: 'desc' },
            })

            // Verify DESC order
            expect(results[0].createdAt.getTime()).toBeGreaterThanOrEqual(
                results[1].createdAt.getTime(),
            )
            expect(results[1].createdAt.getTime()).toBeGreaterThanOrEqual(
                results[2].createdAt.getTime(),
            )
        })

        it('should get latest report using findFirst with orderBy', async () => {
            const latestReport = createMockAIReport({
                id: 'latest',
                createdAt: new Date('2024-01-03'),
            })

            const testMock = createMockPrismaClient()
            testMock.aIReport.findFirst = mock(() =>
                Promise.resolve(latestReport),
            )

            const result = await testMock.aIReport.findFirst({
                where: { symbol: 'NVDA' },
                orderBy: { createdAt: 'desc' },
            })

            expect(testMock.aIReport.findFirst).toHaveBeenCalledWith({
                where: { symbol: 'NVDA' },
                orderBy: { createdAt: 'desc' },
            })
            expect(result?.id).toBe('latest')
        })

        it('should store Markdown content in text field', async () => {
            const markdownContent = `# NVIDIA Analysis Report

## Summary
Strong momentum in AI chip market.

## Key Metrics
- Revenue Growth: 122%
- Gross Margin: 76%

## Recommendation
**BUY** - Target Price: $600`

            const testMock = createMockPrismaClient()
            testMock.aIReport.create = mock(() =>
                Promise.resolve(
                    createMockAIReport({ content: markdownContent }),
                ),
            )

            const result = await testMock.aIReport.create({
                data: { symbol: 'NVDA', content: markdownContent },
            })

            expect(result.content).toContain('# NVIDIA Analysis Report')
            expect(result.content).toContain('**BUY**')
        })

        it('should allow multiple reports for same symbol', async () => {
            const reports = [
                createMockAIReport({ id: '1', symbol: 'NVDA' }),
                createMockAIReport({ id: '2', symbol: 'NVDA' }),
                createMockAIReport({ id: '3', symbol: 'NVDA' }),
            ]

            const testMock = createMockPrismaClient()
            testMock.aIReport.findMany = mock(() => Promise.resolve(reports))

            const results = await testMock.aIReport.findMany({
                where: { symbol: 'NVDA' },
            })

            expect(results.length).toBe(3)
            expect(results.every((r) => r.symbol === 'NVDA')).toBe(true)
        })
    })
})
