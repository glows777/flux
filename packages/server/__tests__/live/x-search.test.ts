/**
 * Live smoke tests for searchX tool (Grok x_search + web_search).
 *
 * Requires XAI_API_KEY and network access.
 * Skipped automatically when key is missing.
 *
 * Run:  bun run test:live
 */

import { describe, it, expect, afterAll } from 'bun:test'
import { createSearchXTool, clearXSearchCache } from '@/core/ai/research'

const HAS_XAI = !!process.env.XAI_API_KEY

describe.skipIf(!HAS_XAI)('searchX tool (live)', () => {
  const tool = createSearchXTool()
  const toolCtx = {
    toolCallId: 'live-sx-1',
    messages: [] as never[],
    abortSignal: AbortSignal.timeout(120_000),
  }

  afterAll(() => clearXSearchCache())

  it('returns report and sources for a finance query', async () => {
    const result = await tool.execute(
      { query: 'What is the latest sentiment about TSLA on social media?' },
      toolCtx,
    ) as { report?: string; sources?: Array<{ title: string; url: string; score: number }>; error?: string }

    if (result.error) {
      throw new Error(`searchX returned error: ${result.error}`)
    }

    expect(typeof result.report).toBe('string')
    expect(result.report!.length).toBeGreaterThan(20)

    expect(Array.isArray(result.sources)).toBe(true)
    if (result.sources!.length > 0) {
      const first = result.sources![0]
      expect(typeof first.title).toBe('string')
      expect(typeof first.url).toBe('string')
      expect(first.url).toMatch(/^https?:\/\//)
      expect(typeof first.score).toBe('number')
    }
  }, 120_000)

  it('supports handles filter', async () => {
    const result = await tool.execute(
      {
        query: 'Latest posts from Elon Musk about AI',
        handles: ['elonmusk'],
      },
      toolCtx,
    ) as { report?: string; error?: string }

    if (result.error) {
      throw new Error(`searchX returned error: ${result.error}`)
    }

    expect(typeof result.report).toBe('string')
    expect(result.report!.length).toBeGreaterThan(10)
  }, 120_000)

  it('supports timeRange filter', async () => {
    const today = new Date()
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const fromDate = weekAgo.toISOString().split('T')[0]
    const toDate = today.toISOString().split('T')[0]

    const result = await tool.execute(
      {
        query: 'NVDA stock discussion',
        timeRange: { from: fromDate, to: toDate },
      },
      toolCtx,
    ) as { report?: string; error?: string }

    if (result.error) {
      throw new Error(`searchX returned error: ${result.error}`)
    }

    expect(typeof result.report).toBe('string')
    expect(result.report!.length).toBeGreaterThan(10)
  }, 120_000)

  it('second call with same query uses cache', async () => {
    const start = Date.now()
    const result = await tool.execute(
      { query: 'What is the latest sentiment about TSLA on social media?' },
      toolCtx,
    ) as { report?: string; error?: string }
    const elapsed = Date.now() - start

    expect(result.error).toBeUndefined()
    expect(typeof result.report).toBe('string')
    expect(elapsed).toBeLessThan(1000)
  }, 10_000)
})
