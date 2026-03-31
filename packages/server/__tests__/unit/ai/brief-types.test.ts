/**
 * Task 03: Brief 类型定义 + Zod Schema 单元测试
 *
 * 测试场景:
 * - MorningBriefSchema 合法数据 parse 成功
 * - macro.signal 非法值 parse 失败
 * - spotlight.signal 非法值 parse 失败
 * - spotlight 空数组 parse 成功
 * - catalysts 空数组 parse 成功
 * - holding 必填 (spotlight item 缺少 holding → 抛 ZodError)
 * - 缺少 generatedAt → 抛 ZodError
 * - keyMetrics 为空数组合法
 */

import { describe, expect, it } from 'bun:test'
import { ZodError } from 'zod'
import {
  MorningBriefSchema,
  MacroSchema,
  SpotlightSchema,
  CatalystSchema,
} from '@/core/ai/brief-types'
import type {
  MorningBrief,
  MacroBrief,
  SpotlightItem,
  CatalystItem,
  BriefResponse,
  PortfolioContext,
} from '@/core/ai/brief-types'

// ==================== Mock 数据 ====================

function validMacro() {
  return {
    summary: 'US markets steady ahead of Fed decision',
    signal: 'neutral' as const,
    keyMetrics: [
      { label: 'S&P 500', value: '5,234.18', change: '+0.3%' },
      { label: 'VIX', value: '14.2', change: '-1.1%' },
    ],
  }
}

function validSpotlight() {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 189.84,
    change: 2.35,
    holding: {
      shares: 50,
      avgCost: 165.0,
      gainPct: 15.05,
    },
    reason: 'Strong Q4 earnings beat expectations',
    action: 'Hold — momentum intact',
    signal: 'bullish' as const,
  }
}

function validCatalyst() {
  return {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    event: 'Q4 Earnings Report',
    date: '2026-03-15',
    daysAway: 15,
  }
}

function validMorningBrief() {
  return {
    generatedAt: '2026-02-28T08:00:00Z',
    macro: validMacro(),
    spotlight: [validSpotlight()],
    catalysts: [validCatalyst()],
  }
}

// ==================== Tests ====================

describe('MorningBriefSchema', () => {
  it('should parse valid complete data successfully', () => {
    const data = validMorningBrief()
    const result = MorningBriefSchema.parse(data)

    expect(result.generatedAt).toBe('2026-02-28T08:00:00Z')
    expect(result.macro.signal).toBe('neutral')
    expect(result.spotlight).toHaveLength(1)
    expect(result.spotlight[0].symbol).toBe('AAPL')
    expect(result.catalysts).toHaveLength(1)
    expect(result.catalysts[0].symbol).toBe('NVDA')
  })

  it('should fail when generatedAt is missing', () => {
    const data = validMorningBrief()
    const { generatedAt: _, ...withoutGeneratedAt } = data

    expect(() => MorningBriefSchema.parse(withoutGeneratedAt)).toThrow(ZodError)
  })
})

describe('MacroSchema', () => {
  it('should parse valid macro data', () => {
    const data = validMacro()
    const result = MacroSchema.parse(data)

    expect(result.summary).toBe('US markets steady ahead of Fed decision')
    expect(result.signal).toBe('neutral')
    expect(result.keyMetrics).toHaveLength(2)
  })

  it('should accept all valid signal values', () => {
    for (const signal of ['risk-on', 'risk-off', 'neutral'] as const) {
      const data = { ...validMacro(), signal }
      expect(() => MacroSchema.parse(data)).not.toThrow()
    }
  })

  it('should fail on invalid signal value', () => {
    const data = { ...validMacro(), signal: 'unknown' }

    expect(() => MacroSchema.parse(data)).toThrow(ZodError)
  })

  it('should accept empty keyMetrics array', () => {
    const data = { ...validMacro(), keyMetrics: [] }
    const result = MacroSchema.parse(data)

    expect(result.keyMetrics).toEqual([])
  })
})

describe('SpotlightSchema', () => {
  it('should parse valid spotlight data', () => {
    const data = validSpotlight()
    const result = SpotlightSchema.parse(data)

    expect(result.symbol).toBe('AAPL')
    expect(result.holding.shares).toBe(50)
    expect(result.signal).toBe('bullish')
  })

  it('should accept all valid signal values', () => {
    for (const signal of ['bullish', 'bearish', 'neutral'] as const) {
      const data = { ...validSpotlight(), signal }
      expect(() => SpotlightSchema.parse(data)).not.toThrow()
    }
  })

  it('should fail on invalid signal value', () => {
    const data = { ...validSpotlight(), signal: 'buy' }

    expect(() => SpotlightSchema.parse(data)).toThrow(ZodError)
  })

  it('should fail when holding is missing', () => {
    const data = validSpotlight()
    const { holding: _, ...withoutHolding } = data

    expect(() => SpotlightSchema.parse(withoutHolding)).toThrow(ZodError)
  })
})

describe('CatalystSchema', () => {
  it('should parse valid catalyst data', () => {
    const data = validCatalyst()
    const result = CatalystSchema.parse(data)

    expect(result.symbol).toBe('NVDA')
    expect(result.event).toBe('Q4 Earnings Report')
    expect(result.daysAway).toBe(15)
  })
})

describe('MorningBriefSchema — array edge cases', () => {
  it('should accept empty spotlight array', () => {
    const data = { ...validMorningBrief(), spotlight: [] }
    const result = MorningBriefSchema.parse(data)

    expect(result.spotlight).toEqual([])
  })

  it('should accept empty catalysts array', () => {
    const data = { ...validMorningBrief(), catalysts: [] }
    const result = MorningBriefSchema.parse(data)

    expect(result.catalysts).toEqual([])
  })
})

describe('Type exports', () => {
  it('should export BriefResponse interface', () => {
    const response: BriefResponse = {
      success: true,
      data: validMorningBrief() as MorningBrief,
      cached: false,
      generatedAt: '2026-02-28T08:00:00Z',
    }

    expect(response.success).toBe(true)
    expect(response.cached).toBe(false)
  })

  it('should export PortfolioContext interface', () => {
    const ctx: PortfolioContext = {
      positionWeights: [{ symbol: 'AAPL', weight: 0.25 }],
      topConcentration: 0.25,
      sectorExposure: [{ sector: 'Technology', weight: 0.6 }],
      totalHoldings: 4,
    }

    expect(ctx.totalHoldings).toBe(4)
    expect(ctx.positionWeights).toHaveLength(1)
  })
})
