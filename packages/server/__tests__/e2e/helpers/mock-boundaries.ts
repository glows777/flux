/**
 * E2E Mock Boundaries
 *
 * Exports mock functions for the 4 external boundaries.
 * The actual mock.module() calls live in setup.ts (preload),
 * because bun only applies mock.module from the preload file
 * or the test file itself — NOT from imported helpers.
 *
 * Test files import these mock functions to customize behavior
 * via .mockImplementation().
 */

import { mock } from 'bun:test'
import { createYahooChartResponse } from './mock-data'

// ─── 1. yahoo-finance2 ───

// biome-ignore lint: mock functions need flexible typing
export const mockYahooQuote = mock((): any =>
    Promise.resolve({
        symbol: 'AAPL',
        regularMarketPrice: 150.0,
        regularMarketChangePercent: 1.5,
        regularMarketVolume: 80_000_000,
        shortName: 'Apple Inc.',
        marketCap: 3_000_000_000_000,
        sector: 'Technology',
    }),
)

// biome-ignore lint: mock functions need flexible typing
export const mockYahooChart = mock((...args: any[]): any => {
    const symbol = (args[0] as string) ?? 'AAPL'
    const opts = args[1] as { period1?: Date; period2?: Date } | undefined
    if (opts?.period1 && opts?.period2) {
        return Promise.resolve(
            createYahooChartResponse(symbol, {
                period1: opts.period1,
                period2: opts.period2,
            }),
        )
    }
    return Promise.resolve(createYahooChartResponse(symbol, 5))
})

// biome-ignore lint: mock functions need flexible typing
export const mockYahooQuoteSummary = mock((): any =>
    Promise.resolve({
        summaryDetail: {
            trailingPE: 28.5,
            dividendYield: 0.005,
        },
        defaultKeyStatistics: {
            trailingEps: 6.15,
        },
    }),
)

// ─── 2. Finnhub (fallback) ───

// Finnhub quote/history/overview throw by default — Finnhub is a fallback source
// in the new FallbackChain architecture. If Yahoo fails, we want Finnhub to also
// fail so tests that check failure behavior work correctly.
export const mockFinnhubGetQuote = mock(() => Promise.reject(new Error('Finnhub mock: not configured')))
export const mockFinnhubGetDailyHistory = mock(() => Promise.reject(new Error('Finnhub mock: not configured')))
export const mockFinnhubGetCompanyOverview = mock(() => Promise.reject(new Error('Finnhub mock: not configured')))

export const mockFinnhubGetCompanyNews = mock(() =>
    Promise.resolve([
        {
            category: 'company',
            datetime: Math.floor(Date.now() / 1000) - 3600,
            headline: 'Test news headline 1',
            id: 1001,
            image: 'https://example.com/img1.jpg',
            related: 'AAPL',
            source: 'Reuters',
            summary: 'Test summary 1',
            url: 'https://example.com/news/1',
        },
        {
            category: 'company',
            datetime: Math.floor(Date.now() / 1000) - 7200,
            headline: 'Test news headline 2',
            id: 1002,
            image: 'https://example.com/img2.jpg',
            related: 'AAPL',
            source: 'Bloomberg',
            summary: 'Test summary 2',
            url: 'https://example.com/news/2',
        },
    ]),
)

// ─── 2b. Search Query (AI-generated) ───

export const mockSearchQueryFindUnique = mock(() =>
    Promise.resolve({
        id: 'cuid-e2e',
        symbol: 'AAPL',
        cnName: '苹果',
        sector: '科技',
        queries: ['苹果 美股', 'AAPL 苹果'],
        ambiguous: true,
        createdAt: new Date(),
    }),
)

// ─── 3. ai (Vercel AI SDK) ───

export const mockGenerateText = mock(() =>
    Promise.resolve({
        text: `## 核心观点
Test report content.

## 技术面分析
MA20 analysis.

## 基本面分析
PE analysis.

## 风险提示
- Risk 1
- Risk 2`,
    }),
)

// biome-ignore lint: mock functions need flexible typing
export const mockTool = mock((config: any) => config)

export const mockStreamText = mock(() => ({
    text: Promise.resolve('mock stream text'),
    steps: Promise.resolve([]),
    textStream: (async function* () {})(),
    toUIMessageStream: () => new ReadableStream(),
    toUIMessageStreamResponse: (_opts?: unknown) =>
        new Response('mock stream', {
            headers: { 'Content-Type': 'text/event-stream' },
        }),
}))

// biome-ignore lint: mock functions need flexible typing
export const mockConvertToModelMessages = mock(
    async (messages: any[]) => messages,
)
export const mockStepCountIs = mock((_count: number) => () => false)

// biome-ignore lint: mock functions need flexible typing
export const mockIsToolUIPart = mock(
    (part: any) => part?.type === 'tool-invocation',
)
// biome-ignore lint: mock functions need flexible typing
export const mockGetToolName = mock((part: any) => part?.toolName ?? 'unknown')

// generateId — returns a stable mock ID
export const mockGenerateId = mock(() => 'mock-e2e-id-1')

// ─── 3b. @/lib/ai/memory (barrel) ───

export const mockReadDocument = mock(() => Promise.resolve(null))
export const mockGetDocumentDetail = mock(() => Promise.resolve(null))
export const mockWriteDocument = mock(() => Promise.resolve())
export const mockAppendDocument = mock(() => Promise.resolve())
export const mockDeleteDocument = mock(() => Promise.resolve())
export const mockListDocuments = mock(() => Promise.resolve([]))
export const mockSearchMemory = mock(() => Promise.resolve([]))
export const mockLoadMemoryContext = mock(() => Promise.resolve(''))
export const mockSyncPortfolioDocument = mock(() => Promise.resolve())
export const mockGenerateEmbedding = mock(() =>
    Promise.resolve(new Array(3072).fill(0)),
)
export const mockCreateMemoryTools = mock(() => ({}))
export const mockCleanMessages = mock(
    () => '## 14:32\n\n**User**: test\n\nAI response',
)
export const mockAppendTranscript = mock(() => Promise.resolve('mock-doc-id'))
export const mockReindexDocument = mock(() => Promise.resolve())
export const mockScheduleReindex = mock(() => {})
export const mockFlushReindex = mock(() => Promise.resolve())

// ─── 3c. @/lib/ai/session — loadMessagesForTranscript ───

export const mockLoadMessagesForTranscript = mock(() => Promise.resolve([]))

// ─── 3d. @/lib/ai/research ───

export const mockCreateResearchTools = mock(() => ({
    webSearch: {
        description: 'mock webSearch',
        execute: mock(() =>
            Promise.resolve({ report: 'mock report', sources: [] }),
        ),
    },
    webFetch: {
        description: 'mock webFetch',
        execute: mock(() =>
            Promise.resolve({
                url: 'https://example.com',
                summary: 'mock summary',
                bytesFetched: 100,
                truncated: false,
                source: 'direct',
            }),
        ),
    },
    searchX: {
        description: 'mock searchX',
        execute: mock(() =>
            Promise.resolve({ report: 'mock X report', sources: [] }),
        ),
    },
}))

// ─── 3e. @/core/ai/chat (generate + finalize) ───

export const mockFinalizeChatRound = mock(() => Promise.resolve())

export const mockChatGenerate = mock(() => Promise.resolve({
    text: 'mock generate response',
    responseMessage: {
        id: 'mock-gen-id',
        role: 'assistant',
        parts: [{ type: 'text', text: 'mock generate response' }],
    },
}))

// ─── 3f. @/core/ai/runtime ───

export const mockRuntimeFinalize = mock(() => Promise.resolve())

export const mockRuntimeConsumeStream = mock(() => Promise.resolve({
    text: 'mock pipeline response',
    responseMessage: {
        id: 'mock-resp-id',
        role: 'assistant',
        parts: [{ type: 'text', text: 'mock pipeline response' }],
        createdAt: new Date(),
    },
    toolCalls: [],
    usage: { inputTokens: 100, outputTokens: 50 },
}))

export const mockRuntimeChat = mock(() => Promise.resolve({
    streamResult: {
        text: Promise.resolve('mock pipeline response'),
        usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
        steps: Promise.resolve([]),
        toUIMessageStreamResponse: (_opts?: unknown) => new Response('mock stream', {
            headers: { 'Content-Type': 'text/event-stream' },
        }),
        toUIMessageStream: (_opts?: unknown) => new ReadableStream(),
    },
    sessionId: 'session-1',
    consumeStream: mockRuntimeConsumeStream,
    finalize: mockRuntimeFinalize,
}))

export const mockRuntime = {
    chat: mockRuntimeChat,
    getToolDisplayMap: mock(() => ({})),
    dispose: mock(() => Promise.resolve()),
}

export const mockCreateAIRuntime = mock(() => Promise.resolve(mockRuntime))

// ─── 3g. @/core/ai/presets ───

export const mockTradingAgentPreset = mock(() => [])
export const mockAutoTradingAgentPreset = mock(() => [])

// ─── 4. @/lib/ai/providers ───

export const mockGetModel = mock(
    (_slotOrProvider: string, _modelId?: string) => ({ modelId: 'mock-model' }),
)
export const mockGetEmbeddingModel = mock(() => ({ modelId: 'mock-embedding' }))

// ─── 5. @/lib/market-data/search ───

// biome-ignore lint: mock functions need flexible typing
export const mockSearchStocks = mock((): Promise<any[]> => Promise.resolve([]))

// ─── 6. @/core/cron/service ───

export const mockCreateCronJob = mock(() => Promise.resolve({ id: 'cron-1', name: 'test', enabled: true }))
export const mockListCronJobs = mock(() => Promise.resolve([]))
export const mockUpdateCronJob = mock(() => Promise.resolve({ id: 'cron-1', enabled: false }))
export const mockDeleteCronJob = mock(() => Promise.resolve({ id: 'cron-1' }))
export const mockGetCronJob = mock(() => Promise.resolve(null))

// ─── 7. Alpaca Client mocks ───

// biome-ignore lint: mock functions need flexible typing
export const mockGetAccount = mock((): Promise<any> => Promise.resolve({
    equity: 100000, cash: 50000, buyingPower: 100000, lastEquity: 99500, longMarketValue: 50000,
}))
// biome-ignore lint: mock functions need flexible typing
export const mockGetPositions = mock((): Promise<any[]> => Promise.resolve([]))
// biome-ignore lint: mock functions need flexible typing
export const mockGetPosition = mock((): Promise<any> => Promise.resolve(null))
// biome-ignore lint: mock functions need flexible typing
export const mockGetOrders = mock((): Promise<any[]> => Promise.resolve([]))
export const mockAlpacaIsConfigured = mock(() => true)
export const mockCreateOrder = mock(() => Promise.resolve(null))
export const mockCancelOrder = mock(() => Promise.resolve(false))
export const mockClosePosition = mock(() => Promise.resolve(null))
