import type { PrismaClient } from '@prisma/client'
import { prisma as defaultPrisma } from '@/core/db'
import { generateReport as defaultGenerateReport } from './report'

const REPORT_TTL_MS = 24 * 60 * 60 * 1000 // 24 小时

export { REPORT_TTL_MS }

interface CachedReport {
  readonly symbol: string
  readonly content: string
  readonly createdAt: Date
  readonly cached: boolean
}

export interface CacheDeps {
  readonly prisma: Pick<PrismaClient, 'aIReport'>
  readonly generateReport: (symbol: string) => Promise<string>
}

function getDefaultDeps(): CacheDeps {
  return { prisma: defaultPrisma, generateReport: defaultGenerateReport }
}

/**
 * 获取研报 (带缓存)
 */
export async function getReportWithCache(
  symbol: string,
  forceRefresh = false,
  deps?: CacheDeps,
): Promise<CachedReport> {
  const resolvedDeps = deps ?? getDefaultDeps()
  const upperSymbol = symbol.toUpperCase()

  // 如果不强制刷新，先检查缓存
  if (!forceRefresh) {
    const cached = await resolvedDeps.prisma.aIReport.findFirst({
      where: { symbol: upperSymbol },
      orderBy: { createdAt: 'desc' },
    })

    if (cached) {
      const age = Date.now() - cached.createdAt.getTime()
      if (age < REPORT_TTL_MS) {
        return {
          symbol: upperSymbol,
          content: cached.content,
          createdAt: cached.createdAt,
          cached: true,
        }
      }
    }
  }

  // 生成新研报
  const content = await resolvedDeps.generateReport(upperSymbol)
  const now = new Date()

  // 存入缓存
  await resolvedDeps.prisma.aIReport.create({
    data: {
      symbol: upperSymbol,
      content,
      createdAt: now,
    },
  })

  return {
    symbol: upperSymbol,
    content,
    createdAt: now,
    cached: false,
  }
}

/**
 * 只读取已有缓存，不触发生成
 */
export async function getReportFromCache(
  symbol: string,
  deps?: CacheDeps,
): Promise<string | null> {
  const resolvedDeps = deps ?? getDefaultDeps()
  const upperSymbol = symbol.toUpperCase()

  const cached = await resolvedDeps.prisma.aIReport.findFirst({
    where: { symbol: upperSymbol },
    orderBy: { createdAt: 'desc' },
  })

  if (!cached) return null

  const age = Date.now() - cached.createdAt.getTime()
  if (age >= REPORT_TTL_MS) return null

  return cached.content
}

/**
 * 清除指定股票的研报缓存
 */
export async function clearReportCache(
  symbol: string,
  deps?: CacheDeps,
): Promise<void> {
  const resolvedDeps = deps ?? getDefaultDeps()
  await resolvedDeps.prisma.aIReport.deleteMany({
    where: { symbol: symbol.toUpperCase() },
  })
}

/**
 * 清除所有过期研报
 */
export async function cleanupExpiredReports(
  deps?: CacheDeps,
): Promise<number> {
  const resolvedDeps = deps ?? getDefaultDeps()
  const cutoff = new Date(Date.now() - REPORT_TTL_MS)
  const result = await resolvedDeps.prisma.aIReport.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  })
  return result.count
}
