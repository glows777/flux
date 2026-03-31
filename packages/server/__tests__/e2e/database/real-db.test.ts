/**
 * P4: Real Database E2E Test
 *
 * Direct Prisma operations against the real PostgreSQL test database.
 * No HTTP routes — validates DB constraints, upserts, and queries.
 */

import { afterAll, beforeEach, describe, expect, it } from 'bun:test'

// Import mock boundaries to prevent real API calls from db.ts transitive imports
import '../helpers/mock-boundaries'

import { cleanupExpiredReports } from '@/core/ai/cache'
import { prisma } from '@/core/db'
import { truncateAllTables } from '../helpers/db-utils'

describe('Real Database Operations (P4)', () => {
    beforeEach(async () => {
        await truncateAllTables(prisma)
    })

    afterAll(async () => {
        await truncateAllTables(prisma)
    })

    // ─── Watchlist CRUD ───

    it('creates, reads, and deletes watchlist items', async () => {
        // Create
        await prisma.watchlist.create({
            data: { symbol: 'AAPL', name: 'Apple Inc.' },
        })

        // Read
        const items = await prisma.watchlist.findMany()
        expect(items).toHaveLength(1)
        expect(items[0].symbol).toBe('AAPL')
        expect(items[0].name).toBe('Apple Inc.')

        // Delete
        await prisma.watchlist.delete({ where: { symbol: 'AAPL' } })
        const afterDelete = await prisma.watchlist.findMany()
        expect(afterDelete).toHaveLength(0)
    })

    // ─── StockHistory unique constraint ───

    it('upserts StockHistory without violating unique constraint', async () => {
        const date = new Date('2024-01-15T00:00:00Z')

        await prisma.stockHistory.create({
            data: {
                symbol: 'AAPL',
                date,
                open: 145.0,
                high: 150.0,
                low: 143.0,
                close: 148.0,
                volume: BigInt(1000000),
            },
        })

        // Upsert same (symbol, date)
        await prisma.stockHistory.upsert({
            where: { symbol_date: { symbol: 'AAPL', date } },
            update: { close: 149.0 },
            create: {
                symbol: 'AAPL',
                date,
                open: 145.0,
                high: 150.0,
                low: 143.0,
                close: 149.0,
            },
        })

        const count = await prisma.stockHistory.count({
            where: { symbol: 'AAPL', date },
        })
        expect(count).toBe(1)

        // Verify latest data retained
        const record = await prisma.stockHistory.findFirst({
            where: { symbol: 'AAPL', date },
        })
        expect(record?.close).toBe(149.0)
    })

    // ─── NewsArticle URL dedup ───

    it('upserts NewsArticle by URL without duplication', async () => {
        const articleData = {
            symbol: 'AAPL',
            headline: 'Apple news',
            source: 'Reuters',
            url: 'https://example.com/unique-article',
            sentiment: 'neutral',
            publishedAt: new Date(),
        }

        await prisma.newsArticle.create({ data: articleData })

        // Upsert with same URL
        await prisma.newsArticle.upsert({
            where: { url: articleData.url },
            update: { headline: 'Updated headline' },
            create: articleData,
        })

        const count = await prisma.newsArticle.count({
            where: { url: articleData.url },
        })
        expect(count).toBe(1)
    })

    // ─── AIReport time query ───

    it('finds latest report by createdAt desc', async () => {
        const older = new Date(Date.now() - 3600 * 1000)
        const newer = new Date()

        await prisma.aIReport.create({
            data: { symbol: 'AAPL', content: 'Old report', createdAt: older },
        })
        await prisma.aIReport.create({
            data: { symbol: 'AAPL', content: 'New report', createdAt: newer },
        })

        const latest = await prisma.aIReport.findFirst({
            where: { symbol: 'AAPL' },
            orderBy: { createdAt: 'desc' },
        })

        expect(latest?.content).toBe('New report')
    })

    // ─── cleanupExpiredReports ───

    it('cleanup removes only expired reports', async () => {
        const expired = new Date(Date.now() - 25 * 3600 * 1000)
        const fresh = new Date()

        await prisma.aIReport.create({
            data: { symbol: 'AAPL', content: 'Expired', createdAt: expired },
        })
        await prisma.aIReport.create({
            data: { symbol: 'AAPL', content: 'Fresh', createdAt: fresh },
        })

        const deleted = await cleanupExpiredReports()
        expect(deleted).toBe(1)

        const remaining = await prisma.aIReport.findMany({
            where: { symbol: 'AAPL' },
        })
        expect(remaining).toHaveLength(1)
        expect(remaining[0].content).toBe('Fresh')
    })

    // ─── Cross-table symbol consistency ───

    it('watchlist and info relate via symbol', async () => {
        await prisma.watchlist.create({
            data: { symbol: 'AAPL', name: 'Apple Inc.' },
        })
        await prisma.stockInfo.create({
            data: { symbol: 'AAPL', name: 'Apple Inc.' },
        })

        const watchlist = await prisma.watchlist.findUnique({
            where: { symbol: 'AAPL' },
        })
        const info = await prisma.stockInfo.findUnique({
            where: { symbol: 'AAPL' },
        })

        expect(watchlist).not.toBeNull()
        expect(info).not.toBeNull()
        expect(watchlist?.symbol).toBe(info?.symbol)
    })
})
