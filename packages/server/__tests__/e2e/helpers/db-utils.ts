/**
 * E2E Database Utilities
 *
 * Helpers for truncating tables, backdating timestamps,
 * and seeding data directly in the test database.
 */

import type { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from '../../helpers/assert-test-db'

export async function truncateAllTables(prisma: PrismaClient): Promise<void> {
    // Double-check safety guard before destructive operation
    assertTestDatabase()

    await prisma.newsArticle.deleteMany()
    await prisma.aIReport.deleteMany()
    await prisma.stockHistory.deleteMany()
    await prisma.stockInfo.deleteMany()
    await prisma.watchlist.deleteMany()
    await prisma.memoryVersion.deleteMany()
}

export async function backdateInfoFetchedAt(
    prisma: PrismaClient,
    symbol: string,
    daysAgo: number,
): Promise<void> {
    const past = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    await prisma.stockInfo.updateMany({
        where: { symbol },
        data: { fetchedAt: past },
    })
}

export async function backdateReportCreatedAt(
    prisma: PrismaClient,
    reportId: string,
    hoursAgo: number,
): Promise<void> {
    const past = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
    await prisma.aIReport.update({
        where: { id: reportId },
        data: { createdAt: past },
    })
}

export async function backdateNewsFetchedAt(
    prisma: PrismaClient,
    symbol: string,
    hoursAgo: number,
): Promise<void> {
    const past = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
    await prisma.newsArticle.updateMany({
        where: { symbol },
        data: { fetchedAt: past },
    })
}

export async function seedWatchlist(
    prisma: PrismaClient,
    symbol: string,
    name: string,
): Promise<void> {
    await prisma.watchlist.create({
        data: { symbol, name },
    })
}

export async function seedNewsArticles(
    prisma: PrismaClient,
    symbol: string,
    count: number,
): Promise<void> {
    for (let i = 0; i < count; i++) {
        await prisma.newsArticle.create({
            data: {
                symbol,
                headline: `Seeded ${symbol} headline ${i + 1}`,
                source: 'TestSource',
                url: `https://test.example.com/${symbol.toLowerCase()}/seeded-${i}-${Date.now()}`,
                summary: `Seeded summary for ${symbol}`,
                sentiment: 'neutral',
                publishedAt: new Date(Date.now() - (i + 1) * 3600 * 1000),
            },
        })
    }
}
