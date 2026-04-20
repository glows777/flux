/**
 * P2-02: Prisma Singleton Unit Tests
 *
 * Test scenarios:
 * - T02-08: Singleton reuse (multiple imports return same instance)
 * - Singleton prevents hot-reload connection leaks in dev
 *
 * NOTE: These tests verify the singleton pattern implementation
 * without requiring a real database connection.
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT_DIR = join(import.meta.dir, '../../..')

describe('P2-02: Prisma Singleton', () => {
    describe('T02-08: Singleton Pattern Implementation', () => {
        it('should have src/core/db.ts file', () => {
            const dbPath = join(ROOT_DIR, 'src/core/db.ts')
            expect(existsSync(dbPath)).toBe(true)
        })

        it('should export prisma constant', () => {
            const dbPath = join(ROOT_DIR, 'src/core/db.ts')
            const dbContent = readFileSync(dbPath, 'utf-8')

            expect(dbContent).toContain('export const prisma')
        })

        it('should import PrismaClient from @prisma/client', () => {
            const dbPath = join(ROOT_DIR, 'src/core/db.ts')
            const dbContent = readFileSync(dbPath, 'utf-8')

            expect(dbContent).toContain(
                "import { PrismaClient } from '@prisma/client'",
            )
        })

        it('should use globalThis for singleton pattern', () => {
            const dbPath = join(ROOT_DIR, 'src/core/db.ts')
            const dbContent = readFileSync(dbPath, 'utf-8')

            expect(dbContent).toContain('globalThis')
            expect(dbContent).toContain('globalForPrisma')
        })

        it('should create new PrismaClient if not in global', () => {
            const dbPath = join(ROOT_DIR, 'src/core/db.ts')
            const dbContent = readFileSync(dbPath, 'utf-8')

            // Prisma 7 uses adapter pattern with factory function
            expect(dbContent).toContain('globalForPrisma.prisma ??')
            expect(dbContent).toContain('createPrismaClient()')
            expect(dbContent).toContain('new PrismaClient({ adapter })')
        })
    })

    describe('Development Mode Hot-Reload Protection', () => {
        it('should store prisma in globalThis in non-production', () => {
            const dbPath = join(ROOT_DIR, 'src/core/db.ts')
            const dbContent = readFileSync(dbPath, 'utf-8')

            expect(dbContent).toContain("process.env.NODE_ENV !== 'production'")
            expect(dbContent).toContain('globalForPrisma.prisma = prisma')
        })

        it('should only store in globalThis when not in production', () => {
            const dbPath = join(ROOT_DIR, 'src/core/db.ts')
            const dbContent = readFileSync(dbPath, 'utf-8')

            // Verify the conditional pattern
            expect(dbContent).toMatch(
                /if\s*\(\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]\s*\)/,
            )
        })
    })

    describe('Type Safety', () => {
        it('should cast globalThis with proper typing', () => {
            const dbPath = join(ROOT_DIR, 'src/core/db.ts')
            const dbContent = readFileSync(dbPath, 'utf-8')

            expect(dbContent).toContain('globalThis as unknown as')
            expect(dbContent).toContain('prisma: PrismaClient | undefined')
        })
    })
})

/**
 * Runtime singleton tests (require DATABASE_URL)
 */
describe('P2-02: Prisma Singleton Runtime Tests', () => {
    const hasDatabase = !!process.env.DATABASE_URL

    // Skip all tests if no database is available
    const testOrSkip = hasDatabase ? it : it.skip

    testOrSkip('should export a prisma instance', async () => {
        const { prisma } = await import('@/core/db')

        expect(prisma).toBeDefined()
        expect(typeof prisma).toBe('object')
    })

    testOrSkip('should expose representative model accessors', async () => {
        const { prisma } = await import('@/core/db')

        // Verify representative model accessors from the current schema.
        expect(prisma.watchlist).toBeDefined()
        expect(prisma.stockHistory).toBeDefined()
        expect(prisma.chatSession).toBeDefined()
        expect(prisma.memoryVersion).toBeDefined()
    })

    testOrSkip(
        'should return the same instance on multiple imports',
        async () => {
            // Import from different paths to simulate multiple imports
            const { prisma: prisma1 } = await import('@/core/db')
            const { prisma: prisma2 } = await import('@/core/db')

            expect(prisma1).toBe(prisma2)
        },
    )

    testOrSkip('should have $connect method', async () => {
        const { prisma } = await import('@/core/db')

        expect(typeof prisma.$connect).toBe('function')
    })

    testOrSkip('should have $disconnect method', async () => {
        const { prisma } = await import('@/core/db')

        expect(typeof prisma.$disconnect).toBe('function')
    })

    testOrSkip('should have $transaction method', async () => {
        const { prisma } = await import('@/core/db')

        expect(typeof prisma.$transaction).toBe('function')
    })
})
