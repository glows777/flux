/**
 * P2-14: 研报生成单元测试
 *
 * 测试场景:
 * - T14-06: generateReport 正常流程 - 返回 Markdown 内容
 * - T14-07: collectContext 并行获取 - 3 个数据源并行请求
 * - T14-08: AI 生成错误 - 抛出错误
 * - T14-09: 数据获取错误 - 抛出错误
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'

// ==================== Mock 'ai' module before any import that touches it ====================

const mockGenerateText = mock(() => Promise.resolve({ text: 'mock report content' }))

mock.module('ai', () => ({
  generateText: mockGenerateText,
}))

// ==================== Imports (after mock.module) ====================

import { generateReport } from '@/core/ai/report'
import type { ReportDeps } from '@/core/ai/report'

// ==================== Mock 数据 ====================

const MOCK_QUOTE = {
  symbol: 'AAPL',
  price: 150.0,
  change: 1.5,
  volume: 1000000,
  timestamp: new Date(),
}

const MOCK_HISTORY = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.now() - (30 - i) * 86400000),
  open: 145 + Math.random() * 10,
  high: 150 + Math.random() * 5,
  low: 140 + Math.random() * 5,
  close: 145 + (i % 5),
  volume: 1000000,
}))

const MOCK_INFO = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  pe: 28.5,
  marketCap: 3e12,
  eps: 6.15,
  dividendYield: 0.005,
  sector: 'Technology',
}

const MOCK_REPORT_CONTENT = `## 核心观点
Apple 股票当前处于上升趋势...

## 技术面分析
MA20 显示...

## 基本面分析
市盈率合理...

## 风险提示
- 风险1
- 风险2
`

// ==================== Mock 依赖工厂 ====================

function createMockDeps(overrides?: Partial<ReportDeps>): ReportDeps {
  return {
    getQuote: mock(() => Promise.resolve(MOCK_QUOTE)),
    getHistoryRaw: mock(() => Promise.resolve(MOCK_HISTORY)),
    getInfo: mock(() => Promise.resolve(MOCK_INFO)),
    model: { modelId: 'mock-model' } as unknown as ReportDeps['model'],
    ...overrides,
  } as unknown as ReportDeps
}

// ==================== 测试套件 ====================

describe('P2-14: generateReport', () => {
  beforeEach(() => {
    mockGenerateText.mockClear()
  })

  it('T14-06: 正常流程 - 返回 Markdown 内容', async () => {
    mockGenerateText.mockImplementation(() => Promise.resolve({ text: MOCK_REPORT_CONTENT }))

    const deps = createMockDeps()

    const result = await generateReport('AAPL', deps)

    expect(result).toBe(MOCK_REPORT_CONTENT)
    expect(mockGenerateText).toHaveBeenCalled()
  })

  it('T14-07: 并行获取 3 个数据源', async () => {
    mockGenerateText.mockImplementation(() => Promise.resolve({ text: MOCK_REPORT_CONTENT }))

    const deps = createMockDeps()

    await generateReport('AAPL', deps)

    // All 3 data sources should be called
    expect(deps.getQuote).toHaveBeenCalledWith('AAPL')
    expect(deps.getHistoryRaw).toHaveBeenCalledWith('AAPL', 30)
    expect(deps.getInfo).toHaveBeenCalledWith('AAPL')
  })

  it('T14-08: AI 生成错误 - 抛出错误', async () => {
    mockGenerateText.mockImplementation(() => Promise.reject(new Error('AI generation failed')))

    const deps = createMockDeps()

    await expect(generateReport('AAPL', deps)).rejects.toThrow('AI generation failed')
  })

  it('T14-09: 数据获取错误 - 抛出错误', async () => {
    mockGenerateText.mockImplementation(() => Promise.resolve({ text: MOCK_REPORT_CONTENT }))

    const deps = createMockDeps({
      getQuote: mock(() => Promise.reject(new Error('Network error'))),
    } as unknown as Partial<ReportDeps>)

    await expect(generateReport('AAPL', deps)).rejects.toThrow('Network error')
  })

  it('collectContext 正确构建 ReportContext', async () => {
    mockGenerateText.mockImplementation(({ prompt }: { prompt: string }) => {
      // Verify prompt contains expected data
      expect(prompt).toContain('AAPL')
      expect(prompt).toContain('Apple Inc.')
      expect(prompt).toContain('$150.00')
      return Promise.resolve({ text: MOCK_REPORT_CONTENT })
    })

    const deps = createMockDeps()

    await generateReport('AAPL', deps)

    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })

  it('传递正确的 AI 生成参数', async () => {
    mockGenerateText.mockImplementation(() => Promise.resolve({ text: MOCK_REPORT_CONTENT }))

    const deps = createMockDeps()

    await generateReport('AAPL', deps)

    const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.maxOutputTokens).toBe(1024)
    expect(callArgs.temperature).toBe(0.7)
  })
})
