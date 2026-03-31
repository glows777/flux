import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import {
  createWebFetchTool,
  clearFetchCache,
  getFetchCacheSize,
} from '@/core/ai/research/web-fetch'
import type { PageContent } from '@/core/ai/research/types'
import { PAGE_CONTENT_MAX_CHARS } from '@/core/ai/research/types'

const toolCtx = { toolCallId: '1', messages: [] as never[], abortSignal: new AbortController().signal }

function makeMockDeps() {
  return {
    readPage: mock<(url: string) => Promise<PageContent>>(() =>
      Promise.resolve({
        content: 'Page content in markdown...',
        bytesFetched: 1024,
        truncated: false,
        source: 'direct' as const,
      })
    ),
    summarize: mock<(content: string, question: string) => Promise<string>>(
      () => Promise.resolve('Summary of the page content.')
    ),
  }
}

describe('createWebFetchTool', () => {
  let deps: ReturnType<typeof makeMockDeps>

  beforeEach(() => {
    clearFetchCache()
    deps = makeMockDeps()
  })

  afterEach(() => {
    clearFetchCache()
  })

  it('returns a tool object with description and execute', () => {
    const t = createWebFetchTool(deps)
    expect(t).toHaveProperty('description')
    expect(t).toHaveProperty('execute')
    expect(typeof t.description).toBe('string')
    expect(typeof t.execute).toBe('function')
  })

  describe('normal read + summarize', () => {
    it('calls readPage then summarize and returns WebFetchSuccess', async () => {
      const t = createWebFetchTool(deps)
      const result = await t.execute(
        { url: 'https://example.com/page', question: 'What is this?' },
        toolCtx
      )

      expect(deps.readPage).toHaveBeenCalledTimes(1)
      expect(deps.summarize).toHaveBeenCalledTimes(1)
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('url')
    })

    it('returns url, summary, bytesFetched, truncated, source', async () => {
      const t = createWebFetchTool(deps)
      const result = (await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )) as { url: string; summary: string; bytesFetched: number; truncated: boolean; source: string }

      expect(result.url).toBe('https://example.com/page')
      expect(result.summary).toBe('Summary of the page content.')
      expect(result.bytesFetched).toBe(1024)
      expect(result.truncated).toBe(false)
      expect(result.source).toBe('direct')
    })

    it('passes question to deps.summarize', async () => {
      const t = createWebFetchTool(deps)
      await t.execute(
        { url: 'https://example.com/page', question: 'Tell me about NVDA' },
        toolCtx
      )

      const call = deps.summarize.mock.calls[0]
      expect(call[1]).toBe('Tell me about NVDA')
    })

    it('source is "direct" when local fetch succeeds', async () => {
      const t = createWebFetchTool(deps)
      const result = (await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )) as { source: string }

      expect(result.source).toBe('direct')
    })

    it('source is "jina" when readPage returns jina', async () => {
      deps.readPage.mockImplementation(() =>
        Promise.resolve({
          content: 'Jina content',
          bytesFetched: 512,
          truncated: false,
          source: 'jina' as const,
        })
      )
      const t = createWebFetchTool(deps)
      const result = (await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )) as { source: string }

      expect(result.source).toBe('jina')
    })
  })

  describe('content truncation', () => {
    it('truncates content over 50,000 chars, truncated: true', async () => {
      const longContent = 'a'.repeat(60_000)
      deps.readPage.mockImplementation(() =>
        Promise.resolve({
          content: longContent,
          bytesFetched: 60_000,
          truncated: false,
          source: 'direct' as const,
        })
      )
      const t = createWebFetchTool(deps)
      const result = (await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )) as { truncated: boolean }

      expect(result.truncated).toBe(true)
      // summarize should receive truncated content
      const summarizeContent = deps.summarize.mock.calls[0][0]
      expect(summarizeContent.length).toBe(PAGE_CONTENT_MAX_CHARS)
    })

    it('does not truncate content under 50,000 chars, truncated: false', async () => {
      deps.readPage.mockImplementation(() =>
        Promise.resolve({
          content: 'short content',
          bytesFetched: 13,
          truncated: false,
          source: 'direct' as const,
        })
      )
      const t = createWebFetchTool(deps)
      const result = (await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )) as { truncated: boolean }

      expect(result.truncated).toBe(false)
    })

    it('truncates at character level — Chinese content not broken', async () => {
      const chineseContent = '中'.repeat(60_000)
      deps.readPage.mockImplementation(() =>
        Promise.resolve({
          content: chineseContent,
          bytesFetched: 180_000,
          truncated: false,
          source: 'direct' as const,
        })
      )
      const t = createWebFetchTool(deps)
      await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )

      const summarizeContent = deps.summarize.mock.calls[0][0]
      expect(summarizeContent.length).toBe(PAGE_CONTENT_MAX_CHARS)
      // Every character should be a complete Chinese character
      expect(summarizeContent).toBe('中'.repeat(PAGE_CONTENT_MAX_CHARS))
    })
  })

  describe('fallback', () => {
    it('readPage returns source=direct — no fallback needed', async () => {
      const t = createWebFetchTool(deps)
      const result = (await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )) as { source: string }

      expect(result.source).toBe('direct')
    })

    it('readPage returns source=jina — uses Jina content', async () => {
      deps.readPage.mockImplementation(() =>
        Promise.resolve({
          content: 'Jina fallback content',
          bytesFetched: 200,
          truncated: false,
          source: 'jina' as const,
        })
      )
      const t = createWebFetchTool(deps)
      const result = (await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )) as { source: string; summary: string }

      expect(result.source).toBe('jina')
      expect(result.summary).toBeDefined()
    })

    it('readPage throws — returns { error }', async () => {
      deps.readPage.mockImplementation(() => Promise.reject(new Error('Fetch failed')))
      const t = createWebFetchTool(deps)
      const result = (await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )) as { error: string }

      expect(result).toHaveProperty('error')
      expect(result.error).toContain('Fetch failed')
    })

    it('summarize fails — returns WebFetchFallback with raw content', async () => {
      deps.summarize.mockImplementation(() => Promise.reject(new Error('AI error')))
      const t = createWebFetchTool(deps)
      const result = (await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )) as { url: string; content: string; bytesFetched: number; truncated: boolean; source: string }

      expect(result).toHaveProperty('content')
      expect(result).not.toHaveProperty('summary')
      expect(result.url).toBe('https://example.com/page')
      expect(result.content).toBe('Page content in markdown...')
      expect(result.source).toBe('direct')
    })
  })

  describe('timeout', () => {
    it('timeout — returns { error: "webFetch timed out..." }', async () => {
      deps.readPage.mockImplementation(
        () =>
          new Promise((_, reject) => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            setTimeout(() => reject(err), 10)
          })
      )
      const t = createWebFetchTool(deps)
      const result = (await t.execute(
        { url: 'https://example.com/page', question: 'What?' },
        toolCtx
      )) as { error: string }

      expect(result).toHaveProperty('error')
    })
  })

  describe('cache', () => {
    it('first call — triggers readPage, writes to cache', async () => {
      const t = createWebFetchTool(deps)
      await t.execute(
        { url: 'https://example.com/page', question: 'Q1' },
        toolCtx
      )

      expect(deps.readPage).toHaveBeenCalledTimes(1)
      expect(getFetchCacheSize()).toBe(1)
    })

    it('same URL second call — does not trigger readPage, reads from cache', async () => {
      const t = createWebFetchTool(deps)
      await t.execute(
        { url: 'https://example.com/page', question: 'Q1' },
        toolCtx
      )
      await t.execute(
        { url: 'https://example.com/page', question: 'Q1' },
        toolCtx
      )

      expect(deps.readPage).toHaveBeenCalledTimes(1)
    })

    it('same URL different question — does not trigger readPage but re-summarizes', async () => {
      const t = createWebFetchTool(deps)
      await t.execute(
        { url: 'https://example.com/page', question: 'Q1' },
        toolCtx
      )
      await t.execute(
        { url: 'https://example.com/page', question: 'Q2' },
        toolCtx
      )

      expect(deps.readPage).toHaveBeenCalledTimes(1)
      expect(deps.summarize).toHaveBeenCalledTimes(2)
      expect(deps.summarize.mock.calls[1][1]).toBe('Q2')
    })

    it('cache expired (over 15min) — re-triggers readPage', async () => {
      const realNow = Date.now
      let fakeTime = realNow()
      Date.now = () => fakeTime

      try {
        const t = createWebFetchTool(deps)
        await t.execute(
          { url: 'https://example.com/page', question: 'Q1' },
          toolCtx
        )

        // Advance time by 16 minutes
        fakeTime += 16 * 60 * 1000

        await t.execute(
          { url: 'https://example.com/page', question: 'Q1' },
          toolCtx
        )

        expect(deps.readPage).toHaveBeenCalledTimes(2)
      } finally {
        Date.now = realNow
      }
    })

    it('LRU eviction — oldest entry evicted when exceeding 100', async () => {
      const t = createWebFetchTool(deps)

      // Fill cache to 100
      for (let i = 0; i < 100; i++) {
        await t.execute(
          { url: `https://example.com/${i}`, question: 'Q' },
          toolCtx
        )
      }
      expect(getFetchCacheSize()).toBe(100)

      // Add one more — oldest should be evicted
      await t.execute(
        { url: 'https://example.com/new', question: 'Q' },
        toolCtx
      )
      expect(getFetchCacheSize()).toBe(100)

      // The first entry should have been evicted
      deps.readPage.mockClear()
      await t.execute(
        { url: 'https://example.com/0', question: 'Q' },
        toolCtx
      )
      expect(deps.readPage).toHaveBeenCalledTimes(1) // Had to re-fetch
    })

    it('cache hit refreshes LRU order — hit entry becomes newest', async () => {
      const t = createWebFetchTool(deps)

      // Fill: 0, 1, 2
      for (let i = 0; i < 3; i++) {
        await t.execute(
          { url: `https://example.com/${i}`, question: 'Q' },
          toolCtx
        )
      }

      // Hit entry 0 (makes it newest)
      await t.execute(
        { url: 'https://example.com/0', question: 'Q' },
        toolCtx
      )

      // Now fill to 100 total (adding 97 more)
      for (let i = 3; i < 100; i++) {
        await t.execute(
          { url: `https://example.com/${i}`, question: 'Q' },
          toolCtx
        )
      }

      // Add one more to trigger eviction — entry 1 should be evicted (oldest), not 0
      await t.execute(
        { url: 'https://example.com/trigger', question: 'Q' },
        toolCtx
      )

      deps.readPage.mockClear()

      // Entry 0 should still be cached (was refreshed)
      await t.execute(
        { url: 'https://example.com/0', question: 'Q' },
        toolCtx
      )
      expect(deps.readPage).toHaveBeenCalledTimes(0)

      // Entry 1 should have been evicted
      await t.execute(
        { url: 'https://example.com/1', question: 'Q' },
        toolCtx
      )
      expect(deps.readPage).toHaveBeenCalledTimes(1)
    })

    it('clearFetchCache clears all cache', async () => {
      const t = createWebFetchTool(deps)
      await t.execute(
        { url: 'https://example.com/page', question: 'Q' },
        toolCtx
      )
      expect(getFetchCacheSize()).toBe(1)

      clearFetchCache()
      expect(getFetchCacheSize()).toBe(0)
    })

    it('getFetchCacheSize returns current cache size', () => {
      expect(getFetchCacheSize()).toBe(0)
    })
  })
})
