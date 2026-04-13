/**
 * P4: Real Database E2E Test
 *
 * Direct Prisma operations against the real PostgreSQL test database.
 * No HTTP routes — validates DB constraints, upserts, and queries.
 */

import { afterAll, beforeEach, describe, expect, it } from 'bun:test'

// Import mock boundaries to prevent real API calls from db.ts transitive imports
import '../helpers/mock-boundaries'

import {
    getSlotContent,
    getSlotHistory,
    SlotContentTooLongError,
    writeSlot,
} from '@/core/ai/memory/store'
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

// ─── MemoryVersion store functions ───

describe('MemoryVersion store functions', () => {
    beforeEach(async () => {
        await prisma.memoryVersion.deleteMany()
    })

    afterAll(async () => {
        await prisma.memoryVersion.deleteMany()
    })

    it('writeSlot then getSlotContent returns the written content', async () => {
        await writeSlot('user_profile', '成长股偏好', 'agent', '测试写入')
        const result = await getSlotContent('user_profile')
        expect(result).toBe('成长股偏好')
    })

    it('getSlotContent returns null for empty slot', async () => {
        const result = await getSlotContent('market_views')
        expect(result).toBeNull()
    })

    it('multiple writes, getSlotContent returns latest version', async () => {
        await writeSlot('lessons', '教训1', 'agent')
        await writeSlot('lessons', '教训2', 'agent')
        await writeSlot('lessons', '教训3', 'agent')
        const result = await getSlotContent('lessons')
        expect(result).toBe('教训3')
    })

    it('getSlotHistory returns 3 versions in descending order', async () => {
        await writeSlot('lessons', '教训1', 'agent')
        await writeSlot('lessons', '教训2', 'agent')
        await writeSlot('lessons', '教训3', 'agent')
        const history = await getSlotHistory('lessons', 10)
        expect(history).toHaveLength(3)
        expect(history[0].content).toBe('教训3') // latest first
        expect(history[2].content).toBe('教训1') // oldest last
    })

    it('writeSlot throws SlotContentTooLongError when content exceeds limit, no DB record created', async () => {
        const tooLong = 'A'.repeat(501) // user_profile limit is 500
        await expect(
            writeSlot('user_profile', tooLong, 'agent'),
        ).rejects.toBeInstanceOf(SlotContentTooLongError)
        const result = await getSlotContent('user_profile')
        expect(result).toBeNull() // no record created
    })
})
