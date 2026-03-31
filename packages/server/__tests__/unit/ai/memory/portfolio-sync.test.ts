import { beforeEach, describe, expect, it, mock } from 'bun:test'

import {
  PORTFOLIO_AUTO_SECTION_START,
  PORTFOLIO_AUTO_SECTION_END,
} from '@/core/ai/memory/types'
import {
  buildHoldingsSection,
  replaceAutoSection,
  syncPortfolioDocument,
  type PortfolioSyncDeps,
} from '@/core/ai/memory/portfolio-sync'
import type { AlpacaPosition } from '@/core/broker/alpaca-client'

// ─── Mock Setup (DI) ───

const mockReadDocument = mock(() => Promise.resolve(null as string | null))
const mockWriteDocument = mock(() => Promise.resolve())

function createDeps(): PortfolioSyncDeps {
  return {
    readDocument: mockReadDocument,
    writeDocument: mockWriteDocument,
  }
}

function makePosition(overrides: Partial<AlpacaPosition> = {}): AlpacaPosition {
  return {
    symbol: 'AAPL',
    qty: 100,
    avgEntryPrice: 185,
    currentPrice: 195,
    marketValue: 19500,
    costBasis: 18500,
    unrealizedPl: 1000,
    unrealizedPlPc: 0.054,
    changeToday: 0.012,
    lastdayPrice: 192,
    ...overrides,
  }
}

let deps: PortfolioSyncDeps

beforeEach(() => {
  deps = createDeps()
  mockReadDocument.mockClear()
  mockWriteDocument.mockClear()
})

// ─── buildHoldingsSection ───

describe('buildHoldingsSection', () => {
  const fixedNow = new Date('2026-03-04T09:30:00Z')

  it('outputs "暂无持仓" when holdings is empty', () => {
    const result = buildHoldingsSection([], fixedNow)

    expect(result).toContain(PORTFOLIO_AUTO_SECTION_START)
    expect(result).toContain(PORTFOLIO_AUTO_SECTION_END)
    expect(result).toContain('暂无持仓')
  })

  it('outputs markdown table for holdings', () => {
    const holdings = [
      { symbol: 'AAPL', name: 'Apple', shares: 100, avgCost: 185 },
    ]

    const result = buildHoldingsSection(holdings, fixedNow)

    expect(result).toContain('| AAPL | Apple | 100 | $185.00 |')
  })

  it('displays "—" when name is null', () => {
    const holdings = [
      { symbol: 'AAPL', name: null, shares: 100, avgCost: 185 },
    ]

    const result = buildHoldingsSection(holdings, fixedNow)

    expect(result).toContain('| AAPL | — | 100 | $185.00 |')
  })

  it('displays decimal shares without trailing zeros', () => {
    const holdings = [
      { symbol: 'AAPL', name: 'Apple', shares: 10.5, avgCost: 185 },
    ]

    const result = buildHoldingsSection(holdings, fixedNow)

    expect(result).toContain('| AAPL | Apple | 10.5 | $185.00 |')
  })

  it('displays integer shares without decimals', () => {
    const holdings = [
      { symbol: 'AAPL', name: 'Apple', shares: 100, avgCost: 185 },
    ]

    const result = buildHoldingsSection(holdings, fixedNow)

    expect(result).toContain('| AAPL | Apple | 100 | $185.00 |')
    expect(result).not.toContain('100.0')
  })

  it('includes timestamp with "_最后同步:" prefix', () => {
    const result = buildHoldingsSection([], fixedNow)

    expect(result).toContain('_最后同步:')
  })
})

// ─── replaceAutoSection ───

describe('replaceAutoSection', () => {
  it('replaces existing auto section between markers', () => {
    const existing = [
      '# Portfolio',
      '',
      PORTFOLIO_AUTO_SECTION_START,
      '## old content',
      PORTFOLIO_AUTO_SECTION_END,
      '',
      '## 交易计划',
      '- 加仓 NVDA',
    ].join('\n')

    const newSection = [
      PORTFOLIO_AUTO_SECTION_START,
      '## new content',
      PORTFOLIO_AUTO_SECTION_END,
    ].join('\n')

    const result = replaceAutoSection(existing, newSection)

    expect(result).toContain('## new content')
    expect(result).not.toContain('## old content')
    expect(result).toContain('- 加仓 NVDA')
  })

  it('inserts at top when markers do not exist', () => {
    const existing = [
      '## 交易计划',
      '- 加仓 NVDA',
      '',
      '## 配置笔记',
    ].join('\n')

    const newSection = [
      PORTFOLIO_AUTO_SECTION_START,
      '## new content',
      PORTFOLIO_AUTO_SECTION_END,
    ].join('\n')

    const result = replaceAutoSection(existing, newSection)

    expect(result).toStartWith(PORTFOLIO_AUTO_SECTION_START)
    expect(result).toContain('- 加仓 NVDA')
    expect(result).toContain('## 配置笔记')
  })
})

// ─── syncPortfolioDocument ───

describe('syncPortfolioDocument', () => {
  it('creates full template with "暂无持仓" when no positions and no existing doc', async () => {
    mockReadDocument.mockResolvedValueOnce(null)

    await syncPortfolioDocument([], deps)

    expect(mockWriteDocument).toHaveBeenCalledTimes(1)
    const content = mockWriteDocument.mock.calls[0][1] as string
    expect(content).toContain('暂无持仓')
    expect(content).toContain('# Portfolio')
    expect(content).toContain('## 交易计划')
    expect(content).toContain('## 配置笔记')
  })

  it('creates full template with table when positions exist and no existing doc', async () => {
    const positions = [
      makePosition({ symbol: 'AAPL', qty: 100, avgEntryPrice: 185 }),
    ]
    mockReadDocument.mockResolvedValueOnce(null)

    await syncPortfolioDocument(positions, deps)

    expect(mockWriteDocument).toHaveBeenCalledTimes(1)
    const content = mockWriteDocument.mock.calls[0][1] as string
    expect(content).toContain('| AAPL | — | 100 | $185.00 |')
    expect(content).toContain('## 交易计划')
  })

  it('preserves hand-written notes when existing doc has markers', async () => {
    const positions = [
      makePosition({ symbol: 'AAPL', qty: 100, avgEntryPrice: 185 }),
    ]
    const existingDoc = [
      '# Portfolio',
      '',
      PORTFOLIO_AUTO_SECTION_START,
      '## old holdings',
      PORTFOLIO_AUTO_SECTION_END,
      '',
      '## 交易计划',
      '- 加仓 NVDA',
    ].join('\n')
    mockReadDocument.mockResolvedValueOnce(existingDoc)

    await syncPortfolioDocument(positions, deps)

    expect(mockWriteDocument).toHaveBeenCalledTimes(1)
    const content = mockWriteDocument.mock.calls[0][1] as string
    expect(content).toContain('加仓 NVDA')
    expect(content).toContain('| AAPL |')
    expect(content).not.toContain('## old holdings')
  })

  it('inserts auto section at top when existing doc has no markers', async () => {
    const positions = [
      makePosition({ symbol: 'NVDA', qty: 200, avgEntryPrice: 130 }),
    ]
    const existingDoc = [
      '## 交易计划',
      '- 加仓 NVDA',
      '',
      '## 配置笔记',
    ].join('\n')
    mockReadDocument.mockResolvedValueOnce(existingDoc)

    await syncPortfolioDocument(positions, deps)

    expect(mockWriteDocument).toHaveBeenCalledTimes(1)
    const content = mockWriteDocument.mock.calls[0][1] as string
    expect(content).toContain(PORTFOLIO_AUTO_SECTION_START)
    expect(content).toContain('| NVDA |')
    expect(content).toContain('- 加仓 NVDA')
  })

  it('maps AlpacaPosition qty to shares and avgEntryPrice to avgCost', async () => {
    const positions = [
      makePosition({ symbol: 'GOOG', qty: 5, avgEntryPrice: 2800 }),
    ]
    mockReadDocument.mockResolvedValueOnce(null)

    await syncPortfolioDocument(positions, deps)

    const content = mockWriteDocument.mock.calls[0][1] as string
    expect(content).toContain('| GOOG | — | 5 | $2,800.00 |')
  })

  it('table rows maintain order from positions array', async () => {
    const positions = [
      makePosition({ symbol: 'AAPL', qty: 100, avgEntryPrice: 185 }),
      makePosition({ symbol: 'NVDA', qty: 200, avgEntryPrice: 130 }),
    ]
    mockReadDocument.mockResolvedValueOnce(null)

    await syncPortfolioDocument(positions, deps)

    const content = mockWriteDocument.mock.calls[0][1] as string
    const aaplIndex = content.indexOf('AAPL')
    const nvdaIndex = content.indexOf('NVDA')
    expect(aaplIndex).toBeLessThan(nvdaIndex)
  })
})
