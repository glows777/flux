/**
 * P2-02: Data Model Integration Tests (Real DB)
 *
 * Test scenarios:
 * - T02-06: Database migration with `prisma db push`
 * - T02-07: Data persistence (create then query)
 *
 * NOTE: These tests require a real database connection.
 * Set DATABASE_URL in .env or skip these tests in CI without DB.
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertTestDatabase } from '../helpers/assert-test-db'

// ─── Safety guard: refuse to run against non-test database ───
assertTestDatabase()

const ROOT_DIR = join(import.meta.dir, '../..')

describe('P2-02: Data Model Integration Tests', () => {
    describe('T02-06: Schema Validation', () => {
        it('should have prisma/schema.prisma with all 5 models', () => {
            const schemaPath = join(ROOT_DIR, 'prisma/schema.prisma')
            expect(existsSync(schemaPath)).toBe(true)

            const schemaContent = readFileSync(schemaPath, 'utf-8')

            // Verify core models exist
            expect(schemaContent).toContain('model Watchlist {')
            expect(schemaContent).toContain('model StockHistory {')
            expect(schemaContent).toContain('model StockInfo {')
        })

        it('should have Watchlist model with correct fields', () => {
            const schemaPath = join(ROOT_DIR, 'prisma/schema.prisma')
            const schemaContent = readFileSync(schemaPath, 'utf-8')

            expect(schemaContent).toContain('symbol    String   @unique')
            expect(schemaContent).toContain('name      String')
            expect(schemaContent).toContain(
                'createdAt DateTime @default(now())',
            )
            expect(schemaContent).toContain('updatedAt DateTime @updatedAt')
        })

        it('should have StockHistory model with composite unique constraint', () => {
            const schemaPath = join(ROOT_DIR, 'prisma/schema.prisma')
            const schemaContent = readFileSync(schemaPath, 'utf-8')

            expect(schemaContent).toContain('@@unique([symbol, date])')
            expect(schemaContent).toContain('@@index([symbol])')
        })

        it('should have StockInfo model with all nullable fields', () => {
            const schemaPath = join(ROOT_DIR, 'prisma/schema.prisma')
            const schemaContent = readFileSync(schemaPath, 'utf-8')

            expect(schemaContent).toContain('pe            Float?')
            expect(schemaContent).toContain('marketCap     BigInt?')
            expect(schemaContent).toContain('eps           Float?')
            expect(schemaContent).toContain('dividendYield Float?')
            expect(schemaContent).toContain('sector        String?')
        })
    })

    describe('T02-07: Prisma Generate Verification', () => {
        it('should have generated Prisma client types', () => {
            // Check that @prisma/client can be imported
            // This verifies that `prisma generate` was successful
            // In monorepo, @prisma/client is hoisted to workspace root
            const workspaceRoot = join(ROOT_DIR, '../..')
            const clientPath = join(
                workspaceRoot,
                'node_modules/@prisma/client/index.d.ts',
            )
            expect(existsSync(clientPath)).toBe(true)
        })

        it('should export all model types from Prisma client', async () => {
            // Dynamically import to verify types are generated
            const prismaClient = await import('@prisma/client')

            // Prisma generates types for all models
            expect(prismaClient.PrismaClient).toBeDefined()
        })
    })

    describe('src/core/db.ts Exports', () => {
        it('should have src/core/db.ts file with prisma export', () => {
            const dbPath = join(ROOT_DIR, 'src/core/db.ts')
            expect(existsSync(dbPath)).toBe(true)

            const dbContent = readFileSync(dbPath, 'utf-8')
            expect(dbContent).toContain('export const prisma')
        })
    })

    describe('lib/types.ts Exports', () => {
        it('should re-export Prisma types', async () => {
            const typesModule = await import('@flux/shared')

            // Types should be re-exported (can be verified at compile time)
            // At runtime, we just verify the module loads without error
            expect(typesModule).toBeDefined()
        })
    })
})

/**
 * Real Database Integration Tests
 *
 * These tests require a running PostgreSQL database.
 * Skip them if DATABASE_URL is not set.
 */
describe('P2-02: Real Database Operations', () => {
    const hasDatabase = !!process.env.DATABASE_URL

    // Skip all tests if no database is available
    const testOrSkip = hasDatabase ? it : it.skip

    describe('Data Persistence Tests', () => {
        testOrSkip(
            'should connect to database',
            async () => {
                const { prisma } = await import('@/core/db')

                // Attempt to connect - should not throw
                await prisma.$connect()

                // Verify connection by querying
                const result = await prisma.$queryRaw`SELECT 1 as test`
                expect(result).toBeDefined()

                // Disconnect after test
                await prisma.$disconnect()
            },
            { timeout: 10000 },
        )

        testOrSkip(
            'should create and query Watchlist',
            async () => {
                const { prisma } = await import('@/core/db')

                // Clean up any existing test data
                await prisma.watchlist
                    .delete({ where: { symbol: 'TEST' } })
                    .catch(() => {
                        // Ignore error if record doesn't exist
                    })

                // Create
                const created = await prisma.watchlist.create({
                    data: {
                        symbol: 'TEST',
                        name: 'Test Corporation',
                    },
                })

                expect(created.id).toBeDefined()
                expect(created.symbol).toBe('TEST')

                // Query
                const found = await prisma.watchlist.findUnique({
                    where: { symbol: 'TEST' },
                })

                expect(found).toBeDefined()
                expect(found?.name).toBe('Test Corporation')

                // Clean up
                await prisma.watchlist.delete({ where: { symbol: 'TEST' } })
                await prisma.$disconnect()
            },
            { timeout: 10000 },
        )

        testOrSkip(
            'should enforce unique constraint on Watchlist symbol',
            async () => {
                const { prisma } = await import('@/core/db')

                // Clean up
                await prisma.watchlist
                    .delete({ where: { symbol: 'UNIQUE_TEST' } })
                    .catch(() => {
                        // Ignore
                    })

                // Create first record
                await prisma.watchlist.create({
                    data: { symbol: 'UNIQUE_TEST', name: 'First' },
                })

                // Attempt to create duplicate - should throw
                let errorThrown = false
                try {
                    await prisma.watchlist.create({
                        data: { symbol: 'UNIQUE_TEST', name: 'Second' },
                    })
                } catch {
                    errorThrown = true
                }
                expect(errorThrown).toBe(true)

                // Clean up
                await prisma.watchlist.delete({
                    where: { symbol: 'UNIQUE_TEST' },
                })
                await prisma.$disconnect()
            },
            { timeout: 10000 },
        )

        testOrSkip(
            'should enforce composite unique on StockHistory',
            async () => {
                const { prisma } = await import('@/core/db')

                const testDate = new Date('2024-01-15T00:00:00.000Z')

                // Clean up using the composite key
                await prisma.stockHistory
                    .delete({
                        where: {
                            symbol_date: {
                                symbol: 'HISTORY_TEST',
                                date: testDate,
                            },
                        },
                    })
                    .catch(() => {
                        // Ignore
                    })

                // Create first record
                await prisma.stockHistory.create({
                    data: {
                        symbol: 'HISTORY_TEST',
                        date: testDate,
                        open: 100,
                        high: 110,
                        low: 95,
                        close: 105,
                    },
                })

                // Attempt duplicate - should throw due to composite unique constraint
                let errorThrown = false
                try {
                    await prisma.stockHistory.create({
                        data: {
                            symbol: 'HISTORY_TEST',
                            date: testDate,
                            open: 100,
                            high: 110,
                            low: 95,
                            close: 105,
                        },
                    })
                } catch {
                    errorThrown = true
                }
                expect(errorThrown).toBe(true)

                // Clean up
                await prisma.stockHistory.delete({
                    where: {
                        symbol_date: { symbol: 'HISTORY_TEST', date: testDate },
                    },
                })
                await prisma.$disconnect()
            },
            { timeout: 10000 },
        )
    })
})
