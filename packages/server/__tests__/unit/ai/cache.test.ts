/**
 * P2-15: 研报缓存单元测试
 *
 * 测试场景:
 * - T15-01: 无缓存时生成新研报 - cached: false，调用 generateReport
 * - T15-02: 缓存命中 (24h内) - cached: true，不调用 generateReport
 * - T15-03: 缓存过期 (>24h) - cached: false，生成新研报
 * - T15-04: forceRefresh=true - 忽略缓存，生成新研报
 * - T15-05: 生成后存入缓存 - AIReport 表有新记录
 * - T15-06: clearReportCache - 删除指定 symbol 的缓存
 * - T15-07: cleanupExpiredReports - 删除所有过期记录
 * - T15-08: 大小写不敏感 - 'aapl' 命中 'AAPL' 缓存
 */

import { describe, expect, it, mock } from 'bun:test'
import {
  getReportWithCache,
  getReportFromCache,
  clearReportCache,
  cleanupExpiredReports,
} from '@/core/ai/cache'
import type { CacheDeps } from '@/core/ai/cache'

// ==================== Mock 数据 ====================

const MOCK_REPORT_CONTENT = '## 核心观点\n测试研报内容...'

function freshCachedReport() {
  return {
    id: '1',
    symbol: 'AAPL',
    content: 'Cached report content',
    createdAt: new Date(),
  }
}

function expiredCachedReport() {
  return {
    id: '2',
    symbol: 'AAPL',
    content: 'Old report content',
    createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 小时前
  }
}

// ==================== Mock 依赖工厂 ====================

function createMockPrisma() {
  return {
    aIReport: {
      findFirst: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 'new-1' })),
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
    },
  }
}

function createMockDeps(overrides?: Partial<CacheDeps>): CacheDeps {
  const base: CacheDeps = {
    prisma: createMockPrisma() as unknown as CacheDeps['prisma'],
    generateReport: mock(() => Promise.resolve(MOCK_REPORT_CONTENT)),
  }
  if (overrides?.prisma) {
    return { ...base, prisma: overrides.prisma }
  }
  if (overrides?.generateReport) {
    return { ...base, generateReport: overrides.generateReport }
  }
  return base
}

// ==================== 测试套件 ====================

describe('P2-15: getReportWithCache', () => {
  it('T15-01: 无缓存时生成新研报', async () => {
    const deps = createMockDeps()

    const result = await getReportWithCache('AAPL', false, deps)

    expect(result.cached).toBe(false)
    expect(result.content).toBe(MOCK_REPORT_CONTENT)
    expect(result.symbol).toBe('AAPL')
    expect(deps.generateReport).toHaveBeenCalledWith('AAPL')
    expect(deps.prisma.aIReport.create).toHaveBeenCalled()
  })

  it('T15-02: 缓存命中 (24h内)', async () => {
    const mockPrisma = createMockPrisma()
    mockPrisma.aIReport.findFirst = mock(() => Promise.resolve(freshCachedReport()))

    const deps = createMockDeps({ prisma: mockPrisma as unknown as CacheDeps['prisma'] })

    const result = await getReportWithCache('AAPL', false, deps)

    expect(result.cached).toBe(true)
    expect(result.content).toBe('Cached report content')
    expect(deps.generateReport).not.toHaveBeenCalled()
  })

  it('T15-03: 缓存过期 (>24h)', async () => {
    const mockPrisma = createMockPrisma()
    mockPrisma.aIReport.findFirst = mock(() => Promise.resolve(expiredCachedReport()))

    const deps = createMockDeps({ prisma: mockPrisma as unknown as CacheDeps['prisma'] })

    const result = await getReportWithCache('AAPL', false, deps)

    expect(result.cached).toBe(false)
    expect(result.content).toBe(MOCK_REPORT_CONTENT)
    expect(deps.generateReport).toHaveBeenCalledWith('AAPL')
  })

  it('T15-04: forceRefresh=true 忽略缓存', async () => {
    const mockPrisma = createMockPrisma()
    mockPrisma.aIReport.findFirst = mock(() => Promise.resolve(freshCachedReport()))

    const deps = createMockDeps({ prisma: mockPrisma as unknown as CacheDeps['prisma'] })

    const result = await getReportWithCache('AAPL', true, deps)

    expect(result.cached).toBe(false)
    expect(result.content).toBe(MOCK_REPORT_CONTENT)
    expect(deps.generateReport).toHaveBeenCalledWith('AAPL')
    // 强制刷新时不查询缓存
    expect(mockPrisma.aIReport.findFirst).not.toHaveBeenCalled()
  })

  it('T15-05: 生成后存入缓存', async () => {
    const deps = createMockDeps()

    await getReportWithCache('AAPL', false, deps)

    expect(deps.prisma.aIReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        symbol: 'AAPL',
        content: MOCK_REPORT_CONTENT,
      }),
    })
  })

  it('T15-08: 大小写不敏感 - aapl 转为 AAPL', async () => {
    const mockPrisma = createMockPrisma()
    mockPrisma.aIReport.findFirst = mock(() => Promise.resolve(freshCachedReport()))

    const deps = createMockDeps({ prisma: mockPrisma as unknown as CacheDeps['prisma'] })

    const result = await getReportWithCache('aapl', false, deps)

    expect(result.symbol).toBe('AAPL')
    expect(mockPrisma.aIReport.findFirst).toHaveBeenCalledWith({
      where: { symbol: 'AAPL' },
      orderBy: { createdAt: 'desc' },
    })
  })
})

describe('P2-15: clearReportCache', () => {
  it('T15-06: 删除指定 symbol 的缓存', async () => {
    const deps = createMockDeps()

    await clearReportCache('AAPL', deps)

    expect(deps.prisma.aIReport.deleteMany).toHaveBeenCalledWith({
      where: { symbol: 'AAPL' },
    })
  })

  it('T15-06b: 大小写不敏感', async () => {
    const deps = createMockDeps()

    await clearReportCache('aapl', deps)

    expect(deps.prisma.aIReport.deleteMany).toHaveBeenCalledWith({
      where: { symbol: 'AAPL' },
    })
  })
})

describe('P2-15: cleanupExpiredReports', () => {
  it('T15-07: 删除所有过期记录', async () => {
    const mockPrisma = createMockPrisma()
    mockPrisma.aIReport.deleteMany = mock(() => Promise.resolve({ count: 5 }))

    const deps = createMockDeps({ prisma: mockPrisma as unknown as CacheDeps['prisma'] })

    const count = await cleanupExpiredReports(deps)

    expect(count).toBe(5)
    expect(mockPrisma.aIReport.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: expect.any(Date) },
      },
    })
  })
})

// ==================== getReportFromCache (只读) ====================

describe('P3-01: getReportFromCache', () => {
  it('缓存命中 (24h内) 返回内容', async () => {
    const mockPrisma = createMockPrisma()
    mockPrisma.aIReport.findFirst = mock(() => Promise.resolve(freshCachedReport()))

    const result = await getReportFromCache('AAPL', {
      prisma: mockPrisma as unknown as CacheDeps['prisma'],
      generateReport: mock(() => Promise.resolve('')),
    })

    expect(result).toBe('Cached report content')
  })

  it('无缓存时返回 null', async () => {
    const mockPrisma = createMockPrisma()
    mockPrisma.aIReport.findFirst = mock(() => Promise.resolve(null))

    const result = await getReportFromCache('AAPL', {
      prisma: mockPrisma as unknown as CacheDeps['prisma'],
      generateReport: mock(() => Promise.resolve('')),
    })

    expect(result).toBeNull()
  })

  it('缓存过期时返回 null', async () => {
    const mockPrisma = createMockPrisma()
    mockPrisma.aIReport.findFirst = mock(() => Promise.resolve(expiredCachedReport()))

    const result = await getReportFromCache('AAPL', {
      prisma: mockPrisma as unknown as CacheDeps['prisma'],
      generateReport: mock(() => Promise.resolve('')),
    })

    expect(result).toBeNull()
  })

  it('不触发 generateReport', async () => {
    const mockPrisma = createMockPrisma()
    mockPrisma.aIReport.findFirst = mock(() => Promise.resolve(null))
    const mockGenerate = mock(() => Promise.resolve('should not be called'))

    await getReportFromCache('AAPL', {
      prisma: mockPrisma as unknown as CacheDeps['prisma'],
      generateReport: mockGenerate,
    })

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('大小写不敏感 - aapl 转为 AAPL', async () => {
    const mockPrisma = createMockPrisma()
    mockPrisma.aIReport.findFirst = mock(() => Promise.resolve(null))

    await getReportFromCache('aapl', {
      prisma: mockPrisma as unknown as CacheDeps['prisma'],
      generateReport: mock(() => Promise.resolve('')),
    })

    expect(mockPrisma.aIReport.findFirst).toHaveBeenCalledWith({
      where: { symbol: 'AAPL' },
      orderBy: { createdAt: 'desc' },
    })
  })
})
