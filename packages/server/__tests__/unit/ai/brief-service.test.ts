/**
 * Unit tests for Morning Brief service (lib/ai/brief.ts)
 *
 * TDD: RED phase — tests written before implementation
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test'

// ─── Mock ai module (must be before any import that uses it) ───

const mockGenerateText = mock()

mock.module('ai', () => ({
  generateText: mockGenerateText,
}))
import type { MorningBrief } from '@/core/ai/brief-types'
import type { PortfolioData, StockMetrics, NewsItem, MacroTicker, WatchlistItemWithChart } from '@flux/shared'
import type { HistoryPoint } from '@/core/market-data'
import type { EarningsL1, UpcomingEarning } from '@/core/finance/types'
import type { EnhancedIndicators } from '@/core/ai/prompts'
import type { PortfolioContext } from '@/core/ai/brief-types'

// ─── Fixtures ───

const VALID_BRIEF: MorningBrief = {
  generatedAt: '2026-02-21T01:00:00Z',
  macro: {
    summary: '美债收益率 4.09%，VIX 18 低位，市场 risk-on',
    signal: 'risk-on',
    keyMetrics: [
      { label: '标普500', value: '5843', change: '+0.7%' },
      { label: 'VIX', value: '18', change: '-2.1%' },
    ],
  },
  spotlight: [
    {
      symbol: 'NVDA',
      name: 'NVIDIA',
      price: 875.4,
      change: 2.3,
      holding: { shares: 10, avgCost: 120, gainPct: 629.5 },
      reason: 'RSI 78 超买，MACD 死叉确认；上季营收 YoY +35%',
      action: 'RSI 超买 + 量比 1.8 放量，短期回调风险上升',
      signal: 'bearish',
    },
  ],
  catalysts: [
    { symbol: 'AAPL', name: 'Apple', event: 'Q1 财报', date: '2026-02-27', daysAway: 6 },
  ],
}

const MOCK_PORTFOLIO: PortfolioData = {
  holdings: [
    {
      symbol: 'NVDA',
      name: 'NVIDIA',
      shares: 10,
      avgCost: 120,
      currentPrice: 875.4,
      dailyChange: 2.3,
      totalPnL: 7554,
      dailyPnL: 196.7,
    },
  ],
  summary: {
    totalValue: 8754,
    totalCost: 1200,
    totalPnL: 7554,
    totalPnLPercent: 629.5,
    todayPnL: 196.7,
    todayPnLPercent: 2.3,
    topContributor: { symbol: 'NVDA', name: 'NVIDIA', dailyPnL: 196.7 },
    vix: 18,
  },
}

const MOCK_MACRO: MacroTicker[] = [
  { sym: '标普500', val: '5843', chg: '+0.7%', trend: 'up' },
  { sym: '纳斯达克100', val: '20500', chg: '+0.9%', trend: 'up' },
  { sym: '十年美债', val: '4.09%', chg: '-0.5%', trend: 'down' },
  { sym: '恐慌指数', val: '18', chg: '-2.1%', trend: 'down' },
]

const MOCK_WATCHLIST: WatchlistItemWithChart[] = [
  { id: 'AAPL', name: 'Apple', price: 210, chg: -0.8, data: [200, 205, 210] },
]

const MOCK_HISTORY: HistoryPoint[] = Array.from({ length: 252 }, (_, i) => ({
  date: new Date(2025, 0, 1 + i),
  open: 100 + i * 0.5,
  high: 105 + i * 0.5,
  low: 95 + i * 0.5,
  close: 102 + i * 0.5,
  volume: 1000000 + i * 10000,
}))

const MOCK_INDICATORS: EnhancedIndicators = {
  ma20: 220,
  rsi: 55,
  ma50: 210,
  ma200: 180,
  trendPosition: 'above-all',
  macd: { value: 2.5, signal: 1.8, histogram: 0.7, crossover: null },
  support: 195,
  resistance: 230,
  volumeRatio: 1.2,
}

const MOCK_INFO: StockMetrics = {
  symbol: 'NVDA',
  name: 'NVIDIA',
  sector: 'Technology',
  pe: 65,
  marketCap: 2000000000000,
  eps: 13.5,
  dividendYield: 0.03,
  fetchedAt: '2026-02-21',
}

const MOCK_NEWS: NewsItem[] = [
  { id: 1, source: 'Reuters', time: '2026-02-21', title: 'NVDA beats earnings', sentiment: 'positive' },
]

const MOCK_L1: EarningsL1 = {
  symbol: 'NVDA',
  name: 'NVIDIA',
  period: 'FY2026 Q4',
  reportDate: '2026-01-15',
  beatMiss: {
    revenue: { actual: 35000000000, expected: 33000000000 },
    eps: { actual: 5.2, expected: 4.9 },
  },
  margins: [
    { quarter: 'Q4 2025', gross: 74, operating: 62, net: 55 },
  ],
  keyFinancials: {
    revenue: 35000000000,
    revenueYoY: 35,
    operatingIncome: 21700000000,
    fcf: 15000000000,
    debtToAssets: 15,
  },
}

const MOCK_UPCOMING: UpcomingEarning[] = [
  { symbol: 'AAPL', name: 'Apple', event: 'FY2026 Q1 财报', date: '2026-02-27', daysAway: 6 },
]

const MOCK_PORTFOLIO_CONTEXT: PortfolioContext = {
  positionWeights: [{ symbol: 'NVDA', weight: 100 }],
  topConcentration: 100,
  sectorExposure: [{ sector: 'Technology', weight: 100 }],
  totalHoldings: 1,
}

// ─── Mock deps factory ───

function createMockDeps(overrides: Record<string, unknown> = {}) {
  return {
    getPortfolio: mock(() => Promise.resolve(MOCK_PORTFOLIO)),
    getMacroData: mock(() => Promise.resolve(MOCK_MACRO)),
    getWatchlistItems: mock(() => Promise.resolve(MOCK_WATCHLIST)),
    getStockHistory: mock(() => Promise.resolve(MOCK_HISTORY)),
    getStockInfo: mock(() => Promise.resolve(MOCK_INFO)),
    getStockNews: mock(() => Promise.resolve(MOCK_NEWS)),
    calculateIndicators: mock(() => MOCK_INDICATORS),
    calculatePortfolioContext: mock(() => MOCK_PORTFOLIO_CONTEXT),
    queryLatestEarningsL1BatchFromCache: mock(() => Promise.resolve(new Map([['NVDA', MOCK_L1]]))),
    queryUpcomingEarningsFromCache: mock(() => Promise.resolve(MOCK_UPCOMING)),
    model: { modelId: 'mock-model' },
    findBriefCache: mock(() => Promise.resolve(null)),
    upsertBriefCache: mock(() => Promise.resolve()),
    ...overrides,
  }
}

// ─── Import SUT ───

import {
  generateBrief,
  toBeijingDateString,
  isBriefExpired,
  getMarketCloseUTC,
  isUSDaylightSaving,
  fetchWithFallback,
  buildFallbackBrief,
} from '@/core/ai/brief'

// ─── Tests ───

describe('Morning Brief Service', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
    mockGenerateText.mockResolvedValue({ text: JSON.stringify(VALID_BRIEF) })
  })

  // ─── Cache tests ───

  describe('cache behavior', () => {
    it('should return cached brief when cache is fresh (not expired)', async () => {
      const now = new Date('2026-02-21T08:00:00Z')
      const cachedBrief = {
        date: toBeijingDateString(now),
        content: JSON.stringify(VALID_BRIEF),
        createdAt: new Date('2026-02-21T01:00:00Z'),
        updatedAt: new Date('2026-02-21T01:00:00Z'),
      }

      const deps = createMockDeps({
        findBriefCache: mock(() => Promise.resolve(cachedBrief)),
      })

      const result = await generateBrief(false, deps, now)

      expect(result.cached).toBe(true)
      expect(result.data).toEqual(VALID_BRIEF)
      expect(mockGenerateText).not.toHaveBeenCalled()
    })

    it('should regenerate when cache date is different from today (cross-day)', async () => {
      const now = new Date('2026-02-22T08:00:00Z')
      const cachedBrief = {
        date: '2026-02-21', // yesterday
        content: JSON.stringify(VALID_BRIEF),
        createdAt: new Date('2026-02-21T01:00:00Z'),
        updatedAt: new Date('2026-02-21T01:00:00Z'),
      }

      const deps = createMockDeps({
        findBriefCache: mock(() => Promise.resolve(cachedBrief)),
      })

      const result = await generateBrief(false, deps, now)

      expect(result.cached).toBe(false)
      expect(mockGenerateText).toHaveBeenCalled()
    })

    it('should regenerate when cache is post-market-close expired', async () => {
      // Market close = UTC 21:00 (non-DST, Feb)
      // Brief created at 15:00 UTC (before close), now is 22:00 UTC (after close)
      const now = new Date('2026-02-21T22:00:00Z')
      const cachedBrief = {
        date: toBeijingDateString(now),
        content: JSON.stringify(VALID_BRIEF),
        createdAt: new Date('2026-02-21T15:00:00Z'), // before close
        updatedAt: new Date('2026-02-21T15:00:00Z'),
      }

      const deps = createMockDeps({
        findBriefCache: mock(() => Promise.resolve(cachedBrief)),
      })

      const result = await generateBrief(false, deps, now)

      expect(result.cached).toBe(false)
      expect(mockGenerateText).toHaveBeenCalled()
    })

    it('should skip cache when forceRefresh is true', async () => {
      const now = new Date('2026-02-21T08:00:00Z')
      const cachedBrief = {
        date: toBeijingDateString(now),
        content: JSON.stringify(VALID_BRIEF),
        createdAt: new Date('2026-02-21T01:00:00Z'),
        updatedAt: new Date('2026-02-21T01:00:00Z'),
      }

      const deps = createMockDeps({
        findBriefCache: mock(() => Promise.resolve(cachedBrief)),
      })

      const result = await generateBrief(true, deps, now)

      expect(result.cached).toBe(false)
      expect(deps.findBriefCache).not.toHaveBeenCalled()
      expect(mockGenerateText).toHaveBeenCalled()
    })
  })

  // ─── Normal generation ───

  describe('normal generation flow', () => {
    it('should generate a complete MorningBrief with all data layers', async () => {
      const deps = createMockDeps()
      const result = await generateBrief(false, deps)

      expect(result.cached).toBe(false)
      expect(result.data).toEqual(VALID_BRIEF)
      expect(result.generatedAt).toBeDefined()

      // Verify all 4 layers were called
      expect(deps.getPortfolio).toHaveBeenCalledTimes(1)
      expect(deps.getMacroData).toHaveBeenCalledTimes(1)
      expect(deps.getWatchlistItems).toHaveBeenCalledTimes(1)
      expect(deps.getStockHistory).toHaveBeenCalledTimes(1) // 1 holding
      expect(deps.getStockInfo).toHaveBeenCalledTimes(1)
      expect(deps.getStockNews).toHaveBeenCalledTimes(1)
      expect(deps.calculateIndicators).toHaveBeenCalledTimes(1)
      expect(deps.calculatePortfolioContext).toHaveBeenCalledTimes(1)
      expect(deps.queryLatestEarningsL1BatchFromCache).toHaveBeenCalledTimes(1)
      expect(deps.queryUpcomingEarningsFromCache).toHaveBeenCalledTimes(1)
      expect(deps.upsertBriefCache).toHaveBeenCalledTimes(1)
    })
  })

  // ─── Zod validation ───

  describe('Zod validation & retry', () => {
    it('should retry with lower temperature when first Zod validation fails', async () => {
      const invalidJson = '{"bad": "json"}'
      mockGenerateText
        .mockResolvedValueOnce({ text: invalidJson })
        .mockResolvedValueOnce({ text: JSON.stringify(VALID_BRIEF) })

      const deps = createMockDeps()

      const result = await generateBrief(false, deps)

      expect(result.data).toEqual(VALID_BRIEF)
      expect(mockGenerateText).toHaveBeenCalledTimes(2)

      // Second call should have lower temperature
      const secondCallOptions = mockGenerateText.mock.calls[1][0]
      expect(secondCallOptions.temperature).toBe(0.1)
    })

    it('should return fallback brief when both Zod validations fail', async () => {
      const invalidJson = '{"bad": "json"}'
      mockGenerateText
        .mockResolvedValueOnce({ text: invalidJson })
        .mockResolvedValueOnce({ text: invalidJson })

      const deps = createMockDeps()

      const result = await generateBrief(false, deps)

      expect(result.data.spotlight).toEqual([])
      expect(result.data.macro).toBeDefined()
      expect(result.data.macro.signal).toBeDefined()
      expect(mockGenerateText).toHaveBeenCalledTimes(2)
    })

    it('should NOT write cache when returning fallback brief', async () => {
      mockGenerateText
        .mockResolvedValueOnce({ text: 'invalid' })
        .mockResolvedValueOnce({ text: 'invalid' })

      const deps = createMockDeps()

      await generateBrief(false, deps)

      expect(deps.upsertBriefCache).not.toHaveBeenCalled()
    })
  })

  // ─── Empty portfolio ───

  describe('empty portfolio', () => {
    it('should return fallback brief with empty spotlight when no holdings', async () => {
      const emptyPortfolio: PortfolioData = {
        holdings: [],
        summary: {
          totalValue: 0,
          totalCost: 0,
          totalPnL: 0,
          totalPnLPercent: 0,
          todayPnL: 0,
          todayPnLPercent: 0,
          topContributor: null,
          vix: 18,
        },
      }

      const deps = createMockDeps({
        getPortfolio: mock(() => Promise.resolve(emptyPortfolio)),
      })

      const result = await generateBrief(false, deps)

      expect(result.data.spotlight).toEqual([])
      expect(result.data.macro).toBeDefined()
      expect(result.data.catalysts).toBeDefined()
      // Should not call per-holding fetchers
      expect(deps.getStockHistory).not.toHaveBeenCalled()
      expect(deps.getStockInfo).not.toHaveBeenCalled()
      expect(deps.getStockNews).not.toHaveBeenCalled()
    })
  })

  // ─── Prompt no-data annotation ───

  describe('prompt content', () => {
    it('should annotate "无缓存数据" when L1 cache is null', async () => {
      const deps = createMockDeps({
        queryLatestEarningsL1BatchFromCache: mock(() => Promise.resolve(new Map([['NVDA', null]]))),
      })

      await generateBrief(false, deps)

      const prompt = mockGenerateText.mock.calls[0][0].prompt as string
      expect(prompt).toContain('无缓存数据')
    })
  })
})

// ─── Prefetched parameter ───

describe('prefetched parameter', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
    mockGenerateText.mockResolvedValue({ text: JSON.stringify(VALID_BRIEF) })
  })

  it('should skip all Layer 1 fetchers when all prefetched data is provided', async () => {
    const deps = createMockDeps()

    const result = await generateBrief(false, deps, undefined, {
      portfolio: MOCK_PORTFOLIO,
      macro: MOCK_MACRO,
      watchlist: MOCK_WATCHLIST,
    })

    expect(result.cached).toBe(false)
    expect(deps.getPortfolio).not.toHaveBeenCalled()
    expect(deps.getMacroData).not.toHaveBeenCalled()
    expect(deps.getWatchlistItems).not.toHaveBeenCalled()
    // Layer 2+ should still run
    expect(deps.getStockHistory).toHaveBeenCalled()
    expect(mockGenerateText).toHaveBeenCalled()
  })

  it('should call missing deps when prefetched is partial', async () => {
    const deps = createMockDeps()

    await generateBrief(false, deps, undefined, {
      portfolio: MOCK_PORTFOLIO,
      // macro and watchlist not provided
    })

    expect(deps.getPortfolio).not.toHaveBeenCalled()
    expect(deps.getMacroData).toHaveBeenCalledTimes(1)
    expect(deps.getWatchlistItems).toHaveBeenCalledTimes(1)
  })

  it('should behave unchanged when prefetched is undefined', async () => {
    const deps = createMockDeps()

    await generateBrief(false, deps, undefined, undefined)

    expect(deps.getPortfolio).toHaveBeenCalledTimes(1)
    expect(deps.getMacroData).toHaveBeenCalledTimes(1)
    expect(deps.getWatchlistItems).toHaveBeenCalledTimes(1)
  })
})

// ─── fetchWithFallback ───

describe('fetchWithFallback', () => {
  it('should return all results when no rate-limit errors', async () => {
    const fetcher = mock<(s: string) => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)

    const results = await fetchWithFallback(['A', 'B', 'C'], fetcher, 0)

    expect(results).toEqual([1, 2, 3])
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('should retry rate-limited symbols serially', async () => {
    const rateLimitError = new Error('429 rate limit exceeded')
    const fetcher = mock<(s: string) => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2) // serial retry for B

    const results = await fetchWithFallback(['A', 'B', 'C'], fetcher, 0)

    expect(results).toEqual([1, 2, 3])
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('should gracefully skip permanently failed symbols instead of throwing', async () => {
    const otherError = new Error('Network error')
    const fetcher = mock<(s: string) => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(otherError)
      .mockRejectedValueOnce(otherError) // retry also fails

    const results = await fetchWithFallback(['A', 'B'], fetcher, 0)

    // B failed both times → null in position
    expect(results).toEqual([1, null])
  })
})

// ─── Cache expiration helpers ───

describe('toBeijingDateString', () => {
  it('should return date string in Beijing timezone', () => {
    // UTC 2026-02-21 20:00 = Beijing 2026-02-22 04:00
    const date = new Date('2026-02-21T20:00:00Z')
    expect(toBeijingDateString(date)).toBe('2026-02-22')
  })

  it('should return same day for early UTC = same day Beijing', () => {
    // UTC 2026-02-21 06:00 = Beijing 2026-02-21 14:00
    const date = new Date('2026-02-21T06:00:00Z')
    expect(toBeijingDateString(date)).toBe('2026-02-21')
  })
})

describe('isUSDaylightSaving', () => {
  it('should return true for DST period (June)', () => {
    const june = new Date('2026-06-15T12:00:00Z')
    expect(isUSDaylightSaving(june)).toBe(true)
  })

  it('should return false for non-DST period (January)', () => {
    const jan = new Date('2026-01-15T12:00:00Z')
    expect(isUSDaylightSaving(jan)).toBe(false)
  })

  it('should return false for non-DST period (February)', () => {
    const feb = new Date('2026-02-15T12:00:00Z')
    expect(isUSDaylightSaving(feb)).toBe(false)
  })
})

describe('getMarketCloseUTC', () => {
  it('should return UTC 20:00 during DST (summer)', () => {
    const summer = new Date('2026-07-15T12:00:00Z')
    const close = getMarketCloseUTC(summer)
    expect(close.getUTCHours()).toBe(20)
    expect(close.getUTCMinutes()).toBe(0)
  })

  it('should return UTC 21:00 during non-DST (winter)', () => {
    const winter = new Date('2026-02-15T12:00:00Z')
    const close = getMarketCloseUTC(winter)
    expect(close.getUTCHours()).toBe(21)
    expect(close.getUTCMinutes()).toBe(0)
  })
})

describe('isBriefExpired', () => {
  it('should return true when brief date is different from today', () => {
    const now = new Date('2026-02-22T08:00:00Z')
    const brief = { date: '2026-02-21', createdAt: new Date('2026-02-21T01:00:00Z'), updatedAt: new Date('2026-02-21T01:00:00Z') }
    expect(isBriefExpired(brief, now)).toBe(true)
  })

  it('should return false when brief is today and before market close', () => {
    // Feb = non-DST, close at UTC 21:00
    // now = UTC 15:00 (before close), brief created at 08:00
    const now = new Date('2026-02-21T15:00:00Z')
    const todayBeijing = toBeijingDateString(now)
    const brief = { date: todayBeijing, createdAt: new Date('2026-02-21T08:00:00Z'), updatedAt: new Date('2026-02-21T08:00:00Z') }
    expect(isBriefExpired(brief, now)).toBe(false)
  })

  it('should return true when today but after market close and brief created before close', () => {
    // Feb = non-DST, close at UTC 21:00
    const now = new Date('2026-02-21T22:00:00Z')
    const todayBeijing = toBeijingDateString(now)
    const brief = { date: todayBeijing, createdAt: new Date('2026-02-21T15:00:00Z'), updatedAt: new Date('2026-02-21T15:00:00Z') }
    expect(isBriefExpired(brief, now)).toBe(true)
  })

  it('should return false when after close but brief was created after close too', () => {
    const now = new Date('2026-02-21T23:00:00Z')
    const todayBeijing = toBeijingDateString(now)
    const brief = { date: todayBeijing, createdAt: new Date('2026-02-21T21:30:00Z'), updatedAt: new Date('2026-02-21T21:30:00Z') }
    expect(isBriefExpired(brief, now)).toBe(false)
  })
})

describe('buildFallbackBrief', () => {
  it('should return brief with empty spotlight', () => {
    const result = buildFallbackBrief(MOCK_MACRO, MOCK_UPCOMING)

    expect(result.spotlight).toEqual([])
    expect(result.macro).toBeDefined()
    expect(result.macro.signal).toBeDefined()
    expect(result.catalysts).toEqual(MOCK_UPCOMING)
    expect(result.generatedAt).toBeDefined()
  })

  it('should infer risk-off when VIX is high', () => {
    const highVixMacro: MacroTicker[] = [
      ...MOCK_MACRO.slice(0, 3),
      { sym: '恐慌指数', val: '32', chg: '+5.0%', trend: 'up' },
    ]

    const result = buildFallbackBrief(highVixMacro, [])
    expect(result.macro.signal).toBe('risk-off')
  })

  it('should infer risk-on when VIX is low', () => {
    const result = buildFallbackBrief(MOCK_MACRO, [])
    expect(result.macro.signal).toBe('risk-on')
  })
})

// ─── Code fence stripping ───

describe('code fence handling', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
    mockGenerateText.mockResolvedValue({ text: JSON.stringify(VALID_BRIEF) })
  })

  it('should parse AI response wrapped in ```json code fences', async () => {
    const wrappedResponse = '```json\n' + JSON.stringify(VALID_BRIEF) + '\n```'
    mockGenerateText.mockResolvedValueOnce({ text: wrappedResponse })
    const deps = createMockDeps()

    const result = await generateBrief(false, deps)

    expect(result.data).toEqual(VALID_BRIEF)
    expect(result.cached).toBe(false)
  })

  it('should parse AI response wrapped in ``` code fences (no language tag)', async () => {
    const wrappedResponse = '```\n' + JSON.stringify(VALID_BRIEF) + '\n```'
    mockGenerateText.mockResolvedValueOnce({ text: wrappedResponse })
    const deps = createMockDeps()

    const result = await generateBrief(false, deps)

    expect(result.data).toEqual(VALID_BRIEF)
  })

  it('should parse AI response without code fences (plain JSON)', async () => {
    const deps = createMockDeps()

    const result = await generateBrief(false, deps)

    expect(result.data).toEqual(VALID_BRIEF)
  })
})

// ─── AI error fallback ───

describe('AI call error fallback', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
    mockGenerateText.mockResolvedValue({ text: JSON.stringify(VALID_BRIEF) })
  })

  it('should return fallback brief when generateText throws', async () => {
    mockGenerateText.mockRejectedValue(new Error('This model is not available in your region.'))
    const deps = createMockDeps()

    const result = await generateBrief(false, deps)

    expect(result.data.spotlight).toEqual([])
    expect(result.data.macro).toBeDefined()
    expect(result.data.macro.signal).toBeDefined()
    expect(result.cached).toBe(false)
  })

  it('should not write cache when AI call throws', async () => {
    mockGenerateText.mockRejectedValue(new Error('rate limit'))
    const deps = createMockDeps()

    await generateBrief(false, deps)

    expect(deps.upsertBriefCache).not.toHaveBeenCalled()
  })
})
