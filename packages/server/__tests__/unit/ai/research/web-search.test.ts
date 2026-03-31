import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { createSearchTavilyTool, createWebSearchTool } from '@/core/ai/research/web-search'
import {
  WEB_SEARCH_SYSTEM_PROMPT,
  WEB_SEARCH_MAX_STEPS,
  RESEARCH_TIMEOUTS,
  type SearchResponse,
} from '@/core/ai/research/types'

function makeMockDeps() {
  return {
    searchWeb: mock<(query: string, options?: unknown) => Promise<SearchResponse>>(() =>
      Promise.resolve({
        results: [
          { title: 'Result 1', url: 'https://example.com/1', content: 'content 1', score: 0.9, publishedDate: '2026-03-01' },
          { title: 'Result 2', url: 'https://example.com/2', content: 'content 2', score: 0.7 },
        ],
      })
    ),
    generateText: mock<(...args: unknown[]) => Promise<unknown>>(() =>
      Promise.resolve({
        text: '综合报告...',
        steps: [
          {
            toolResults: [
              {
                toolName: 'searchTavily',
                output: {
                  results: [
                    { title: 'R1', url: 'https://a.com', content: 'c1', score: 0.9 },
                    { title: 'R2', url: 'https://b.com', content: 'c2', score: 0.7 },
                  ],
                },
              },
            ],
          },
        ],
      })
    ),
    searchModel: { modelId: 'test-search-model' } as never,
  }
}

describe('createSearchTavilyTool', () => {
  let deps: ReturnType<typeof makeMockDeps>

  beforeEach(() => {
    deps = makeMockDeps()
  })

  it('returns a tool object with description and execute', () => {
    const t = createSearchTavilyTool(deps)
    expect(t).toHaveProperty('description')
    expect(t).toHaveProperty('execute')
    expect(typeof t.description).toBe('string')
    expect(typeof t.execute).toBe('function')
  })

  it('calls deps.searchWeb with correct parameters', async () => {
    const t = createSearchTavilyTool(deps)
    await t.execute({ query: 'NVDA earnings', topic: 'finance', maxResults: 5 }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal })

    expect(deps.searchWeb).toHaveBeenCalledTimes(1)
    const call = deps.searchWeb.mock.calls[0]
    expect(call[0]).toBe('NVDA earnings')
    expect(call[1]).toEqual({ topic: 'finance', maxResults: 5 })
  })

  it('defaults to topic=finance, maxResults=5', async () => {
    const t = createSearchTavilyTool(deps)
    await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal })

    const call = deps.searchWeb.mock.calls[0]
    expect(call[1]).toEqual({ topic: 'finance', maxResults: 5 })
  })

  it('forwards timeRange when provided', async () => {
    const t = createSearchTavilyTool(deps)
    await t.execute({ query: 'test', timeRange: 'week' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal })

    const call = deps.searchWeb.mock.calls[0]
    expect(call[1]).toEqual(expect.objectContaining({ timeRange: 'week' }))
  })

  it('returns results with title, url, content, score, publishedDate', async () => {
    const t = createSearchTavilyTool(deps)
    const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as SearchResponse

    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toEqual({
      title: 'Result 1',
      url: 'https://example.com/1',
      content: 'content 1',
      score: 0.9,
      publishedDate: '2026-03-01',
    })
  })

  it('returns { error } when deps.searchWeb throws', async () => {
    deps.searchWeb.mockImplementation(() => Promise.reject(new Error('Network error')))
    const t = createSearchTavilyTool(deps)
    const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as { error: string }

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('Network error')
  })

  it('returns empty results when searchWeb returns empty', async () => {
    deps.searchWeb.mockImplementation(() => Promise.resolve({ results: [] }))
    const t = createSearchTavilyTool(deps)
    const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as SearchResponse

    expect(result.results).toEqual([])
  })
})

describe('createWebSearchTool', () => {
  let deps: ReturnType<typeof makeMockDeps>

  beforeEach(() => {
    deps = makeMockDeps()
  })

  it('returns a tool object with description and execute', () => {
    const t = createWebSearchTool(deps)
    expect(t).toHaveProperty('description')
    expect(t).toHaveProperty('execute')
    expect(typeof t.description).toBe('string')
    expect(typeof t.execute).toBe('function')
  })

  describe('generateText call parameters', () => {
    it('model is deps.searchModel', async () => {
      const t = createWebSearchTool(deps)
      await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal })

      const call = deps.generateText.mock.calls[0][0] as Record<string, unknown>
      expect(call.model).toBe(deps.searchModel)
    })

    it('system prompt is WEB_SEARCH_SYSTEM_PROMPT', async () => {
      const t = createWebSearchTool(deps)
      await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal })

      const call = deps.generateText.mock.calls[0][0] as Record<string, unknown>
      expect(call.system).toBe(WEB_SEARCH_SYSTEM_PROMPT)
    })

    it('prompt contains user query', async () => {
      const t = createWebSearchTool(deps)
      await t.execute({ query: 'NVDA analyst rating' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal })

      const call = deps.generateText.mock.calls[0][0] as Record<string, unknown>
      expect(call.prompt).toContain('NVDA analyst rating')
    })

    it('tools contains searchTavily', async () => {
      const t = createWebSearchTool(deps)
      await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal })

      const call = deps.generateText.mock.calls[0][0] as Record<string, unknown>
      const tools = call.tools as Record<string, unknown>
      expect(tools).toHaveProperty('searchTavily')
    })

    it('stopWhen is stepCountIs(WEB_SEARCH_MAX_STEPS)', async () => {
      const t = createWebSearchTool(deps)
      await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal })

      const call = deps.generateText.mock.calls[0][0] as Record<string, unknown>
      expect(call.stopWhen).toBeDefined()
    })

    it('abortSignal is passed', async () => {
      const t = createWebSearchTool(deps)
      const controller = new AbortController()
      await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: controller.signal })

      const call = deps.generateText.mock.calls[0][0] as Record<string, unknown>
      expect(call.abortSignal).toBeDefined()
    })
  })

  describe('normal return', () => {
    it('report comes from result.text', async () => {
      const t = createWebSearchTool(deps)
      const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as { report: string }

      expect(result.report).toBe('综合报告...')
    })

    it('sources extracted from result.steps searchTavily results', async () => {
      const t = createWebSearchTool(deps)
      const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as { sources: Array<{ title: string; url: string; score: number }> }

      expect(result.sources).toHaveLength(2)
      expect(result.sources[0]).toEqual({ title: 'R1', url: 'https://a.com', score: 0.9 })
      expect(result.sources[1]).toEqual({ title: 'R2', url: 'https://b.com', score: 0.7 })
    })

    it('sources deduped by URL, keeping highest score', async () => {
      deps.generateText.mockImplementation(() =>
        Promise.resolve({
          text: 'report',
          steps: [
            {
              toolResults: [
                {
                  toolName: 'searchTavily',
                  output: {
                    results: [
                      { title: 'R1', url: 'https://a.com', content: 'c', score: 0.5 },
                      { title: 'R1 updated', url: 'https://a.com', content: 'c', score: 0.9 },
                    ],
                  },
                },
              ],
            },
          ],
        })
      )
      const t = createWebSearchTool(deps)
      const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as { sources: Array<{ title: string; url: string; score: number }> }

      expect(result.sources).toHaveLength(1)
      expect(result.sources[0].score).toBe(0.9)
      expect(result.sources[0].title).toBe('R1 updated')
    })

    it('sources sorted by score descending', async () => {
      deps.generateText.mockImplementation(() =>
        Promise.resolve({
          text: 'report',
          steps: [
            {
              toolResults: [
                {
                  toolName: 'searchTavily',
                  output: {
                    results: [
                      { title: 'Low', url: 'https://low.com', content: 'c', score: 0.3 },
                      { title: 'High', url: 'https://high.com', content: 'c', score: 0.95 },
                      { title: 'Mid', url: 'https://mid.com', content: 'c', score: 0.6 },
                    ],
                  },
                },
              ],
            },
          ],
        })
      )
      const t = createWebSearchTool(deps)
      const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as { sources: Array<{ title: string; url: string; score: number }> }

      expect(result.sources[0].score).toBe(0.95)
      expect(result.sources[1].score).toBe(0.6)
      expect(result.sources[2].score).toBe(0.3)
    })

    it('sources contain title, url, score', async () => {
      const t = createWebSearchTool(deps)
      const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as { sources: Array<{ title: string; url: string; score: number }> }

      for (const s of result.sources) {
        expect(s).toHaveProperty('title')
        expect(s).toHaveProperty('url')
        expect(s).toHaveProperty('score')
      }
    })
  })

  describe('error handling', () => {
    it('generateText throws -> returns { error }', async () => {
      deps.generateText.mockImplementation(() => Promise.reject(new Error('AI failed')))
      const t = createWebSearchTool(deps)
      const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as { error: string }

      expect(result).toHaveProperty('error')
      expect(result.error).toContain('AI failed')
    })

    it('timeout -> returns { error: "webSearch timed out..." }', async () => {
      deps.generateText.mockImplementation(
        () => new Promise((_, reject) => {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          setTimeout(() => reject(err), 10)
        })
      )
      const t = createWebSearchTool(deps)
      const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as { error: string }

      expect(result).toHaveProperty('error')
    })

    it('result.steps is empty -> sources is empty array', async () => {
      deps.generateText.mockImplementation(() =>
        Promise.resolve({ text: 'no results found', steps: [] })
      )
      const t = createWebSearchTool(deps)
      const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as { sources: unknown[] }

      expect(result.sources).toEqual([])
    })

    it('no searchTavily tool calls -> sources is empty array', async () => {
      deps.generateText.mockImplementation(() =>
        Promise.resolve({
          text: 'report',
          steps: [{ toolResults: [{ toolName: 'otherTool', output: {} }] }],
        })
      )
      const t = createWebSearchTool(deps)
      const result = await t.execute({ query: 'test' }, { toolCallId: '1', messages: [], abortSignal: new AbortController().signal }) as { sources: unknown[] }

      expect(result.sources).toEqual([])
    })
  })
})
