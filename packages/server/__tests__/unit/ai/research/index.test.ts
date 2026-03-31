import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'

// Mock external modules before importing
const mockTavilySearch = mock(() =>
  Promise.resolve({
    results: [
      { title: 'T1', url: 'https://example.com/1', content: 'c1', score: 0.9, publishedDate: '2026-03-01' },
    ],
  })
)
const mockTavilyClient = { search: mockTavilySearch }
const mockTavily = mock(() => mockTavilyClient)

mock.module('@tavily/core', () => ({
  tavily: mockTavily,
}))

const mockProxyFetch = mock(() =>
  Promise.resolve(
    new Response('<html><body><h1>Title</h1><p>Some long content here repeated enough to pass minimum length check. '.repeat(20) + '</p></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
  )
)

mock.module('@/core/market-data', () => ({
  proxyFetch: mockProxyFetch,
}))

const mockTurndownConvert = mock(() => '# Title\n\n' + 'Some long content here repeated enough to pass minimum length check. '.repeat(20))
const MockTurndownService = mock(() => ({
  turndown: mockTurndownConvert,
}))

mock.module('turndown', () => ({
  default: MockTurndownService,
}))

const mockGetModel = mock(() => ({ modelId: 'mock-model' }))
const mockGetEmbeddingModel = mock(() => ({ modelId: 'mock-embedding-model' }))

mock.module('@/core/ai/providers', () => ({
  getModel: mockGetModel,
  getEmbeddingModel: mockGetEmbeddingModel,
  resetProviders: mock(() => {}),
}))

// Save and restore env
const savedEnv: Record<string, string | undefined> = {}
const envKeys = [
  'TAVILY_API_KEY',
  'JINA_API_KEY',
]

function saveEnv() {
  for (const key of envKeys) {
    savedEnv[key] = process.env[key]
  }
}

function restoreEnv() {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
}

function setTestEnv() {
  process.env.TAVILY_API_KEY = 'test-tavily-key'
  delete process.env.JINA_API_KEY
}

// Now import the module under test
import {
  createWebSearchTool,
  createWebFetchTool,
  createDefaultResearchDeps,
  createResearchTools,
  RESEARCH_TIMEOUTS,
  PAGE_CONTENT_MAX_CHARS,
  FETCH_CACHE_TTL,
  FETCH_CACHE_MAX_SIZE,
} from '@/core/ai/research'

describe('barrel exports', () => {
  it('can import createWebSearchTool', () => {
    expect(typeof createWebSearchTool).toBe('function')
  })

  it('can import createWebFetchTool', () => {
    expect(typeof createWebFetchTool).toBe('function')
  })

  it('can import createDefaultResearchDeps', () => {
    expect(typeof createDefaultResearchDeps).toBe('function')
  })

  it('can import createResearchTools', () => {
    expect(typeof createResearchTools).toBe('function')
  })

  it('can import RESEARCH_TIMEOUTS', () => {
    expect(RESEARCH_TIMEOUTS).toBeDefined()
    expect(RESEARCH_TIMEOUTS.searchTavily).toBeGreaterThan(0)
  })

  it('can import PAGE_CONTENT_MAX_CHARS, FETCH_CACHE_TTL, FETCH_CACHE_MAX_SIZE', () => {
    expect(PAGE_CONTENT_MAX_CHARS).toBe(50_000)
    expect(FETCH_CACHE_TTL).toBe(15 * 60 * 1000)
    expect(FETCH_CACHE_MAX_SIZE).toBe(100)
  })
})

describe('createResearchTools', () => {
  beforeEach(() => {
    saveEnv()
    setTestEnv()
  })
  afterEach(restoreEnv)

  it('returns an object with webSearch and webFetch', () => {
    const mockDeps = {
      searchWeb: mock(() => Promise.resolve({ results: [] })),
      generateText: mock(() => Promise.resolve({ text: '', steps: [] })) as never,
      searchModel: { modelId: 'test' } as never,
      readPage: mock(() => Promise.resolve({ content: '', bytesFetched: 0, truncated: false, source: 'direct' as const })),
      summarize: mock(() => Promise.resolve('summary')),
    }
    const tools = createResearchTools(mockDeps)
    expect(tools).toHaveProperty('webSearch')
    expect(tools).toHaveProperty('webFetch')
  })

  it('each tool has description and execute', () => {
    const mockDeps = {
      searchWeb: mock(() => Promise.resolve({ results: [] })),
      generateText: mock(() => Promise.resolve({ text: '', steps: [] })) as never,
      searchModel: { modelId: 'test' } as never,
      readPage: mock(() => Promise.resolve({ content: '', bytesFetched: 0, truncated: false, source: 'direct' as const })),
      summarize: mock(() => Promise.resolve('summary')),
    }
    const tools = createResearchTools(mockDeps)
    expect(typeof tools.webSearch.description).toBe('string')
    expect(typeof tools.webSearch.execute).toBe('function')
    expect(typeof tools.webFetch.description).toBe('string')
    expect(typeof tools.webFetch.execute).toBe('function')
  })

  it('uses custom deps when provided', () => {
    const customSearchWeb = mock(() => Promise.resolve({ results: [] }))
    const mockDeps = {
      searchWeb: customSearchWeb,
      generateText: mock(() => Promise.resolve({ text: '', steps: [] })) as never,
      searchModel: { modelId: 'custom-model' } as never,
      readPage: mock(() => Promise.resolve({ content: '', bytesFetched: 0, truncated: false, source: 'direct' as const })),
      summarize: mock(() => Promise.resolve('summary')),
    }
    const tools = createResearchTools(mockDeps)
    expect(tools).toHaveProperty('webSearch')
    expect(tools).toHaveProperty('webFetch')
  })
})

describe('createDefaultResearchDeps', () => {
  beforeEach(() => {
    saveEnv()
    setTestEnv()
    mockGetModel.mockClear()
  })
  afterEach(restoreEnv)

  it('returns object with searchWeb, readPage, summarize, generateText, searchModel', () => {
    const deps = createDefaultResearchDeps()
    expect(deps).toHaveProperty('searchWeb')
    expect(deps).toHaveProperty('readPage')
    expect(deps).toHaveProperty('summarize')
    expect(deps).toHaveProperty('generateText')
    expect(deps).toHaveProperty('searchModel')
    expect(typeof deps.searchWeb).toBe('function')
    expect(typeof deps.readPage).toBe('function')
    expect(typeof deps.summarize).toBe('function')
  })

  it('TAVILY_API_KEY missing -> searchWeb throws error containing "TAVILY_API_KEY"', () => {
    delete process.env.TAVILY_API_KEY
    const deps = createDefaultResearchDeps()
    expect(deps.searchWeb('test')).rejects.toThrow(/TAVILY_API_KEY/)
  })

  it('calls getModel with "search" slot for searchModel', () => {
    mockGetModel.mockClear()
    createDefaultResearchDeps()
    const calls = mockGetModel.mock.calls.map((c) => c[0])
    expect(calls).toContain('search')
  })
})

describe('createSummarize uses getModel("light")', () => {
  beforeEach(() => {
    saveEnv()
    setTestEnv()
    mockGetModel.mockClear()
  })
  afterEach(restoreEnv)

  it('createDefaultResearchDeps calls getModel with "light" slot (for summarize)', () => {
    createDefaultResearchDeps()
    // createSummarize() calls getModel('light') lazily (on invocation), but
    // the summarize closure captures getModel. The slot call happens at summarize call time.
    // We verify getModel('search') is called eagerly and 'light' is called on summarize invocation.
    const eagerCalls = mockGetModel.mock.calls.map((c) => c[0])
    expect(eagerCalls).toContain('search')
  })

  it('summarize invocation calls getModel("light")', async () => {
    const mockGenerateText = mock(() => Promise.resolve({ text: 'summary result' }))
    mock.module('ai', () => ({ generateText: mockGenerateText }))

    mockGetModel.mockClear()
    const deps = createDefaultResearchDeps()

    mockGetModel.mockClear()
    await deps.summarize('some content', 'some question')

    const calls = mockGetModel.mock.calls.map((c) => c[0])
    expect(calls).toContain('light')
  })
})

describe('readPage implementation (defaultReadPage)', () => {
  // Note: module-level TurndownService uses real Turndown (static import
  // hoisting prevents mock.module from intercepting transitive deps).
  // Tests use HTML that produces > MIN_DIRECT_CONTENT_LENGTH (500) chars
  // of markdown after real Turndown conversion.
  //
  // happy-dom 的 DOMParser 实现不完整，导致 Turndown 返回空字符串。
  // 通过 patch DOMParser.prototype.parseFromString 使用 domino 解析器绕过。
  const domino = require('@mixmark-io/domino')
  let savedParseFromString: typeof DOMParser.prototype.parseFromString

  const longParagraph = 'This is a detailed paragraph with enough text content. '.repeat(15)
  const defaultHtml = `<html><body><h1>Article</h1><p>${longParagraph}</p></body></html>`
  const longHtml = `<html><body><h1>Title</h1><p>${'x'.repeat(60_000)}</p></body></html>`

  function makeHtmlResponse(html: string) {
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
  }

  beforeEach(() => {
    // Patch happy-dom's DOMParser to use domino, fixing Turndown empty output
    savedParseFromString = DOMParser.prototype.parseFromString
    DOMParser.prototype.parseFromString = function (str: string, _type: string) {
      return domino.createDocument(str)
    }

    saveEnv()
    setTestEnv()
    mockProxyFetch.mockClear()
    // Restore default proxyFetch: return HTML that produces > 500 chars markdown
    mockProxyFetch.mockImplementation(() => Promise.resolve(makeHtmlResponse(defaultHtml)))
  })
  afterEach(() => {
    DOMParser.prototype.parseFromString = savedParseFromString
    restoreEnv()
  })

  it('direct fetch success -> returns source: "direct"', async () => {
    const deps = createDefaultResearchDeps()
    const result = await deps.readPage('https://example.com/article')

    expect(result.source).toBe('direct')
    expect(result.content.length).toBeGreaterThan(0)
  })

  it('direct fetch uses proxyFetch with User-Agent header', async () => {
    const deps = createDefaultResearchDeps()
    await deps.readPage('https://example.com/article')

    expect(mockProxyFetch).toHaveBeenCalled()
    const firstCall = mockProxyFetch.mock.calls[0]
    expect(firstCall[0]).toBe('https://example.com/article')
    const opts = firstCall[1] as { headers?: Record<string, string> }
    expect(opts.headers?.['User-Agent']).toContain('FluxBot')
  })

  it('direct fetch converts HTML to Markdown via Turndown', async () => {
    const deps = createDefaultResearchDeps()
    const result = await deps.readPage('https://example.com/article')

    // Real Turndown converts <h1> to markdown heading, strips HTML tags
    expect(result.source).toBe('direct')
    expect(result.content).not.toContain('<p>')
    expect(result.content).toContain('Article')
  })

  it('direct fetch non-200 -> falls back to Jina', async () => {
    mockProxyFetch
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('Forbidden', { status: 403 }))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('# Jina Content\n\nSome article text.', { status: 200 }))
      )

    const deps = createDefaultResearchDeps()
    const result = await deps.readPage('https://example.com/blocked')

    expect(result.source).toBe('jina')
  })

  it('direct fetch content too short (< 500 chars) -> falls back to Jina', async () => {
    mockProxyFetch
      .mockImplementationOnce(() =>
        Promise.resolve(makeHtmlResponse('<html><body><p>Short</p></body></html>'))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('# Full Jina Content\n\n' + 'Paragraph. '.repeat(100), { status: 200 }))
      )

    const deps = createDefaultResearchDeps()
    const result = await deps.readPage('https://example.com/sparse')

    expect(result.source).toBe('jina')
  })

  it('direct fetch throws -> falls back to Jina', async () => {
    mockProxyFetch
      .mockImplementationOnce(() => Promise.reject(new Error('Network error')))
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('# Jina Fallback\n\nContent here.', { status: 200 }))
      )

    const deps = createDefaultResearchDeps()
    const result = await deps.readPage('https://example.com/error')

    expect(result.source).toBe('jina')
  })

  it('Jina Reader URL format: https://r.jina.ai/{encoded url}', async () => {
    mockProxyFetch
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('Forbidden', { status: 403 }))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('# Jina content', { status: 200 }))
      )

    const deps = createDefaultResearchDeps()
    await deps.readPage('https://example.com/page?q=test')

    const jinaCall = mockProxyFetch.mock.calls[1]
    expect(jinaCall[0]).toBe(`https://r.jina.ai/${encodeURIComponent('https://example.com/page?q=test')}`)
  })

  it('Jina request includes Accept: text/markdown header', async () => {
    mockProxyFetch
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('Forbidden', { status: 403 }))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('# Jina content', { status: 200 }))
      )

    const deps = createDefaultResearchDeps()
    await deps.readPage('https://example.com/page')

    const jinaCall = mockProxyFetch.mock.calls[1]
    const headers = (jinaCall[1] as { headers?: Record<string, string> })?.headers
    expect(headers?.Accept).toBe('text/markdown')
  })

  it('JINA_API_KEY set -> Jina request includes Authorization header', async () => {
    process.env.JINA_API_KEY = 'jina-test-key'
    mockProxyFetch
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('Forbidden', { status: 403 }))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('# Jina content', { status: 200 }))
      )

    const deps = createDefaultResearchDeps()
    await deps.readPage('https://example.com/page')

    const jinaCall = mockProxyFetch.mock.calls[1]
    const headers = (jinaCall[1] as { headers?: Record<string, string> })?.headers
    expect(headers?.Authorization).toBe('Bearer jina-test-key')
  })

  it('both direct and Jina fail -> throws error', async () => {
    mockProxyFetch
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('Forbidden', { status: 403 }))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('Service Unavailable', { status: 503 }))
      )

    const deps = createDefaultResearchDeps()
    expect(deps.readPage('https://example.com/down')).rejects.toThrow()
  })

  it('content over 50,000 chars -> truncated: true', async () => {
    mockProxyFetch.mockImplementation(() =>
      Promise.resolve(makeHtmlResponse(longHtml))
    )

    const deps = createDefaultResearchDeps()
    const result = await deps.readPage('https://example.com/long')

    expect(result.truncated).toBe(true)
    expect(result.content.length).toBe(50_000)
  })

  it('content under 50,000 chars -> truncated: false', async () => {
    const deps = createDefaultResearchDeps()
    const result = await deps.readPage('https://example.com/normal')

    expect(result.truncated).toBe(false)
  })

  it('bytesFetched reflects original content size', async () => {
    const deps = createDefaultResearchDeps()
    const result = await deps.readPage('https://example.com/article')

    expect(result.bytesFetched).toBeGreaterThan(0)
  })
})

describe('searchWeb implementation', () => {
  beforeEach(() => {
    saveEnv()
    setTestEnv()
    mockTavilySearch.mockClear()
    mockTavily.mockClear()
  })
  afterEach(restoreEnv)

  it('calls Tavily SDK with TAVILY_API_KEY', async () => {
    const deps = createDefaultResearchDeps()
    await deps.searchWeb('NVDA earnings')

    expect(mockTavily).toHaveBeenCalledWith({ apiKey: 'test-tavily-key' })
  })

  it('passes query and options to tavily.search', async () => {
    const deps = createDefaultResearchDeps()
    await deps.searchWeb('NVDA', { topic: 'finance', maxResults: 3 })

    expect(mockTavilySearch).toHaveBeenCalledTimes(1)
    const call = mockTavilySearch.mock.calls[0]
    expect(call[0]).toBe('NVDA')
    expect(call[1]).toEqual(expect.objectContaining({ topic: 'finance', maxResults: 3 }))
  })

  it('returns normalized SearchResponse', async () => {
    const deps = createDefaultResearchDeps()
    const result = await deps.searchWeb('test')

    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toHaveProperty('title')
    expect(result.results[0]).toHaveProperty('url')
    expect(result.results[0]).toHaveProperty('content')
    expect(result.results[0]).toHaveProperty('score')
  })

  it('defaults topic to "general" when not provided', async () => {
    const deps = createDefaultResearchDeps()
    await deps.searchWeb('test')

    const call = mockTavilySearch.mock.calls[0]
    expect(call[1]).toEqual(expect.objectContaining({ topic: 'general' }))
  })

  it('forwards timeRange when provided', async () => {
    const deps = createDefaultResearchDeps()
    await deps.searchWeb('test', { timeRange: 'week' })

    const call = mockTavilySearch.mock.calls[0]
    expect(call[1]).toEqual(expect.objectContaining({ timeRange: 'week' }))
  })
})
