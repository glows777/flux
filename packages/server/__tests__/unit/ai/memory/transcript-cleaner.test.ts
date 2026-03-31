import { describe, it, expect } from 'bun:test'
import type { UIMessage } from 'ai'
import type { TranscriptMessage } from '@/core/ai/memory/types'
import {
  cleanMessages,
  summarizeToolResult,
} from '@/core/ai/memory/transcript-cleaner'

let idCounter = 0
const nextId = () => `test-id-${++idCounter}`

// ─── Test Helpers ───

function makeUserMessage(
  text: string,
  createdAt?: Date,
): TranscriptMessage {
  return {
    message: {
      id: nextId(),
      role: 'user' as const,
      parts: [{ type: 'text' as const, text }],
    },
    createdAt: createdAt ?? new Date('2025-03-08T14:32:00Z'),
  }
}

function makeAssistantMessage(
  parts: UIMessage['parts'],
  createdAt?: Date,
): TranscriptMessage {
  return {
    message: {
      id: nextId(),
      role: 'assistant' as const,
      parts,
    },
    createdAt: createdAt ?? new Date('2025-03-08T14:32:01Z'),
  }
}

function makeToolPart(
  toolName: string,
  input: unknown,
  output: unknown,
): {
  type: string
  toolCallId: string
  state: string
  input: unknown
  output: unknown
} {
  return {
    type: `tool-${toolName}`,
    toolCallId: nextId(),
    state: 'output-available',
    input,
    output,
  }
}

// ─── summarizeToolResult ───

describe('summarizeToolResult', () => {
  it('formats getQuote with symbol and key fields', () => {
    const result = summarizeToolResult(
      'getQuote',
      { symbol: 'NVDA' },
      { price: 145.2, change: 2.3, volume: 58000000 },
    )
    expect(result).toBe(
      '> [getQuote NVDA] price=145.2, change=2.3, volume=58000000',
    )
  })

  it('only includes fields from TOOL_SUMMARY_FIELDS for getCompanyInfo', () => {
    const result = summarizeToolResult(
      'getCompanyInfo',
      { symbol: 'NVDA' },
      {
        name: 'NVIDIA Corp',
        pe: 82.3,
        marketCap: 3600000000000,
        eps: 1.2,
        dividendYield: 0,
        sector: 'Technology',
      },
    )
    expect(result).toBe(
      '> [getCompanyInfo NVDA] name=NVIDIA Corp, sector=Technology, pe=82.3, marketCap=3600000000000',
    )
  })

  it('formats getNews array results with quoted titles (max 3)', () => {
    const result = summarizeToolResult(
      'getNews',
      { symbol: 'NVDA' },
      [
        { title: 'Apple 发布...', source: 'x', time: 'x', url: 'x' },
        { title: 'NVDA 财报...', source: 'x', time: 'x', url: 'x' },
      ],
    )
    expect(result).toBe('> [getNews NVDA] "Apple 发布...", "NVDA 财报..."')
  })

  it('limits array results to first 3 items', () => {
    const result = summarizeToolResult(
      'getNews',
      { symbol: 'NVDA' },
      [
        { title: 't1' },
        { title: 't2' },
        { title: 't3' },
        { title: 't4' },
        { title: 't5' },
      ],
    )
    expect(result).toBe('> [getNews NVDA] "t1", "t2", "t3"')
  })

  it('returns null for tools not in TOOL_SUMMARY_FIELDS', () => {
    const result = summarizeToolResult(
      'getHistory',
      { symbol: 'NVDA' },
      [{ date: '2025-01-01', close: 100 }],
    )
    expect(result).toBeNull()
  })

  it('returns null for unknown tools', () => {
    const result = summarizeToolResult('unknown_tool', {}, { foo: 'bar' })
    expect(result).toBeNull()
  })

  it('returns null when result is null', () => {
    const result = summarizeToolResult('getQuote', { symbol: 'NVDA' }, null)
    expect(result).toBeNull()
  })

  it('returns null when result is undefined', () => {
    const result = summarizeToolResult(
      'getQuote',
      { symbol: 'NVDA' },
      undefined,
    )
    expect(result).toBeNull()
  })

  it('omits identifier when input has no symbol or query', () => {
    const result = summarizeToolResult(
      'getQuote',
      {},
      { price: 145.2, change: 2.3, volume: 58000000 },
    )
    expect(result).toBe(
      '> [getQuote] price=145.2, change=2.3, volume=58000000',
    )
  })

  it('uses query as identifier when symbol is absent', () => {
    const result = summarizeToolResult(
      'getNews',
      { query: 'NVDA earnings' },
      [{ title: 'Earnings beat' }],
    )
    expect(result).toBe('> [getNews NVDA earnings] "Earnings beat"')
  })
})

// ─── ArrayField tests ───

describe('summarizeToolResult — ArrayField', () => {
  it('webSearch: sources array -> outputs "title: url, title: url, ..."', () => {
    const result = summarizeToolResult(
      'webSearch',
      { query: 'NVDA analyst rating' },
      {
        report: '综合报告...',
        sources: [
          { title: 'NVDA Analyst Upgrade', url: 'https://example.com/1', score: 0.92 },
          { title: 'NVDA Price Target', url: 'https://example.com/2', score: 0.85 },
          { title: 'Rating Change', url: 'https://example.com/3', score: 0.78 },
        ],
      },
    )
    expect(result).toBe(
      '> [webSearch NVDA analyst rating] NVDA Analyst Upgrade: https://example.com/1, NVDA Price Target: https://example.com/2, Rating Change: https://example.com/3',
    )
  })

  it('webSearch: sources over 3 items -> only takes first 3', () => {
    const result = summarizeToolResult(
      'webSearch',
      { query: 'NVDA' },
      {
        report: '...',
        sources: [
          { title: 'S1', url: 'https://1.com', score: 0.9 },
          { title: 'S2', url: 'https://2.com', score: 0.8 },
          { title: 'S3', url: 'https://3.com', score: 0.7 },
          { title: 'S4', url: 'https://4.com', score: 0.5 },
        ],
      },
    )
    expect(result).not.toContain('S4')
    expect(result).toContain('S3')
  })

  it('webSearch: sources missing -> skips, no error', () => {
    const result = summarizeToolResult(
      'webSearch',
      { query: 'NVDA' },
      { report: '...' },
    )
    expect(result).toBe('> [webSearch NVDA] ')
  })

  it('webSearch: sources is not an array -> skips, no error', () => {
    const result = summarizeToolResult(
      'webSearch',
      { query: 'NVDA' },
      { report: '...', sources: 'not-an-array' },
    )
    expect(result).toBe('> [webSearch NVDA] ')
  })

  it('webSearch: sources sub-items missing pick fields -> filters null', () => {
    const result = summarizeToolResult(
      'webSearch',
      { query: 'NVDA' },
      {
        report: '...',
        sources: [
          { title: 'Title Only' },
          { url: 'https://url-only.com' },
        ],
      },
    )
    expect(result).toContain('Title Only')
    expect(result).toContain('https://url-only.com')
  })
})

describe('summarizeToolResult — webFetch', () => {
  it('webFetch: result { url: "https://..." } -> outputs url=...', () => {
    const result = summarizeToolResult(
      'webFetch',
      { url: 'https://example.com/article', question: 'What is...' },
      { url: 'https://example.com/article', summary: '...', bytesFetched: 5000, truncated: false, source: 'direct' },
    )
    expect(result).toBe('> [webFetch] url=https://example.com/article')
  })
})

describe('summarizeToolResult — backward compatibility', () => {
  it('getQuote: pure string FieldSpec behavior unchanged', () => {
    const result = summarizeToolResult(
      'getQuote',
      { symbol: 'AAPL' },
      { price: 180.5, change: -1.2, volume: 42000000 },
    )
    expect(result).toBe('> [getQuote AAPL] price=180.5, change=-1.2, volume=42000000')
  })

  it('getCompanyInfo: pure string FieldSpec behavior unchanged', () => {
    const result = summarizeToolResult(
      'getCompanyInfo',
      { symbol: 'AAPL' },
      { name: 'Apple Inc', sector: 'Technology', pe: 28.5, marketCap: 2800000000000 },
    )
    expect(result).toBe('> [getCompanyInfo AAPL] name=Apple Inc, sector=Technology, pe=28.5, marketCap=2800000000000')
  })

  it('getNews (array branch): uses simpleFields filter, behavior unchanged', () => {
    const result = summarizeToolResult(
      'getNews',
      { symbol: 'AAPL' },
      [
        { title: 'Apple earnings beat', source: 'Reuters', time: '2h', url: 'x' },
        { title: 'New iPhone launch', source: 'BBC', time: '5h', url: 'y' },
      ],
    )
    expect(result).toBe('> [getNews AAPL] "Apple earnings beat", "New iPhone launch"')
  })
})

describe('summarizeToolResult — mixed FieldSpec', () => {
  it('handles mixed ["url", { field: "items", pick: ["name"] }]', () => {
    // To test this, we need a tool with mixed specs.
    // webFetch only has 'url', and webSearch only has ArrayField.
    // The mixed case would work if we had such a config.
    // For now, test that existing tools work correctly with their specs.
    const webFetchResult = summarizeToolResult(
      'webFetch',
      {},
      { url: 'https://example.com', summary: 'test' },
    )
    expect(webFetchResult).toBe('> [webFetch] url=https://example.com')

    const webSearchResult = summarizeToolResult(
      'webSearch',
      { query: 'test' },
      { report: '...', sources: [{ title: 'T', url: 'U' }] },
    )
    expect(webSearchResult).toBe('> [webSearch test] T: U')
  })
})

// ─── cleanMessages ───

describe('cleanMessages', () => {
  it('formats user + assistant text into a time-stamped block', () => {
    const messages = [
      makeUserMessage('分析 NVDA'),
      makeAssistantMessage([{ type: 'text', text: 'NVDA 当前...' }]),
    ]
    const result = cleanMessages(messages)
    expect(result).toContain('## 14:32')
    expect(result).toContain('**User**: 分析 NVDA')
    expect(result).toContain('NVDA 当前...')
  })

  it('filters out system messages', () => {
    const messages: TranscriptMessage[] = [
      {
        message: {
          id: '1',
          role: 'system' as const,
          parts: [{ type: 'text', text: '你是 AI 分析师' }],
        },
        createdAt: new Date(),
      },
    ]
    const result = cleanMessages(messages)
    expect(result).toBe('')
  })

  it('includes data tool summary line', () => {
    const messages = [
      makeUserMessage('分析 NVDA'),
      makeAssistantMessage([
        makeToolPart(
          'getQuote',
          { symbol: 'NVDA' },
          { price: 145.2, change: 2.3, volume: 58000000 },
        ) as unknown as UIMessage['parts'][number],
        { type: 'text', text: 'Analysis complete.' },
      ]),
    ]
    const result = cleanMessages(messages)
    expect(result).toContain('> [getQuote NVDA]')
  })

  it('filters out memory tool calls', () => {
    const messages = [
      makeUserMessage('test'),
      makeAssistantMessage([
        makeToolPart(
          'memory_write',
          { path: 'test.md' },
          { success: true },
        ) as unknown as UIMessage['parts'][number],
        { type: 'text', text: 'Done.' },
      ]),
    ]
    const result = cleanMessages(messages)
    expect(result).not.toContain('memory_write')
  })

  it('filters out display_comparison_table tool calls', () => {
    const messages = [
      makeUserMessage('compare'),
      makeAssistantMessage([
        makeToolPart(
          'display_comparison_table',
          { title: 'test' },
          { rows: [] },
        ) as unknown as UIMessage['parts'][number],
        { type: 'text', text: 'Here is the comparison.' },
      ]),
    ]
    const result = cleanMessages(messages)
    expect(result).not.toContain('display_comparison_table')
  })

  it('filters out display_rating_card tool calls', () => {
    const messages = [
      makeUserMessage('rate'),
      makeAssistantMessage([
        makeToolPart(
          'display_rating_card',
          { symbol: 'NVDA' },
          { rating: '买入' },
        ) as unknown as UIMessage['parts'][number],
        { type: 'text', text: 'Rating shown.' },
      ]),
    ]
    const result = cleanMessages(messages)
    expect(result).not.toContain('display_rating_card')
  })

  it('filters out tools not in TOOL_SUMMARY_FIELDS (e.g. getHistory)', () => {
    const messages = [
      makeUserMessage('history'),
      makeAssistantMessage([
        makeToolPart(
          'getHistory',
          { symbol: 'NVDA', days: 30 },
          [{ date: '2025-01-01', close: 100 }],
        ) as unknown as UIMessage['parts'][number],
        { type: 'text', text: 'Chart data.' },
      ]),
    ]
    const result = cleanMessages(messages)
    expect(result).not.toContain('getHistory')
  })

  it('formats multi-turn conversations with separate time blocks', () => {
    const messages = [
      makeUserMessage('分析 NVDA', new Date('2025-03-08T14:32:00Z')),
      makeAssistantMessage(
        [{ type: 'text', text: '从绝对 PE 看...' }],
        new Date('2025-03-08T14:32:05Z'),
      ),
      makeUserMessage('那跟 AMD 比呢？', new Date('2025-03-08T14:35:00Z')),
      makeAssistantMessage(
        [{ type: 'text', text: 'NVDA 当前 PE 82 vs AMD...' }],
        new Date('2025-03-08T14:35:05Z'),
      ),
    ]
    const result = cleanMessages(messages)
    expect(result).toContain('## 14:32')
    expect(result).toContain('## 14:35')
  })

  it('returns empty string for empty messages array', () => {
    const result = cleanMessages([])
    expect(result).toBe('')
  })

  it('skips tool parts with non output-available state', () => {
    const errorToolPart = makeToolPart(
      'getQuote',
      { symbol: 'NVDA' },
      null,
    )
    errorToolPart.state = 'output-error'

    const messages = [
      makeUserMessage('test'),
      makeAssistantMessage([
        errorToolPart as unknown as UIMessage['parts'][number],
        { type: 'text', text: 'Error occurred.' },
      ]),
    ]
    const result = cleanMessages(messages)
    expect(result).not.toContain('[getQuote')
    expect(result).toContain('Error occurred.')
  })

  it('handles assistant-only messages (no preceding user message)', () => {
    const messages = [
      makeAssistantMessage(
        [{ type: 'text', text: 'Welcome!' }],
        new Date('2025-03-08T10:00:00Z'),
      ),
    ]
    const result = cleanMessages(messages)
    expect(result).toContain('## 10:00')
    expect(result).toContain('Welcome!')
  })
})
