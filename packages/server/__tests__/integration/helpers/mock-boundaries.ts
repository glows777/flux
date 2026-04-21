/**
 * Integration Test Mock Boundaries
 *
 * Exports mock functions for ALL external boundaries used by integration tests.
 * The actual mock.module() calls live in setup.ts (preload),
 * because bun only applies mock.module from the preload file
 * or the test file itself — NOT from imported helpers.
 *
 * Test files import these mock functions to customize behavior
 * via .mockImplementation() in beforeEach blocks.
 */

import { mock } from 'bun:test'

// ─── @/lib/db — Prisma models ───

// watchlist model
export const mockWatchlistFindMany = mock(() =>
    Promise.resolve(
        [] as Array<{
            id: string
            symbol: string
            name: string
            createdAt: Date
            updatedAt: Date
        }>,
    ),
)
export const mockWatchlistFindUnique = mock(() => Promise.resolve(null))
export const mockWatchlistCreate = mock(() =>
    Promise.resolve({
        id: 'cuid-new',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        createdAt: new Date('2024-06-01'),
        updatedAt: new Date('2024-06-01'),
    }),
)
export const mockWatchlistDelete = mock(() =>
    Promise.resolve({
        id: 'cuid-new',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        createdAt: new Date('2024-06-01'),
        updatedAt: new Date('2024-06-01'),
    }),
)

// aIReport model
export const mockAIReportFindFirst = mock(() => Promise.resolve(null))
export const mockAIReportCreate = mock(() => Promise.resolve({ id: 'new-1' }))
export const mockAIReportDeleteMany = mock(() => Promise.resolve({ count: 0 }))

// ─── @/lib/market-data/sync ───

export const mockGetQuoteWithCache = mock(async (symbol: string) => ({
    symbol,
    price: 150.0,
    change: 1.5,
    volume: 80000000,
    timestamp: new Date(),
}))

export const mockGetHistoryWithCache = mock(
    async (_symbol: string, _days?: number) =>
        Array.from({ length: 20 }, (_, i) => ({
            date: new Date(Date.UTC(2024, 5, 20 - i)),
            open: 145 + i,
            high: 155 + i,
            low: 140 + i,
            close: 150 + i,
            volume: 1000000 + i * 10000,
        })),
)

export const mockGetInfoWithCache = mock(async (symbol: string) => ({
    symbol,
    name: 'Apple Inc.',
    sector: 'Technology',
    pe: 28.5,
    marketCap: 2500000000000,
    eps: 6.5,
    dividendYield: 0.55,
}))

// ─── yahoo-finance2 ───

// biome-ignore lint: mock functions need flexible typing
export const mockYahooQuoteFn = mock(() => Promise.resolve({} as any))

// ─── @/lib/market-data/news ───

export const mockGetStockNews = mock((_symbol: string, _limit?: number) =>
    Promise.resolve([
        {
            id: 'cuid-1',
            source: 'Reuters',
            time: '2023-11-14T22:13:20.000Z',
            title: 'AAPL reports strong quarter',
            sentiment: 'neutral',
            url: 'https://reuters.com/article/aapl',
            summary: 'Apple reported better-than-expected earnings.',
        },
    ]),
)

// ─── @/lib/market-data/macro ───

export const mockGetMacroIndicators = mock(() => Promise.resolve([]))

// ─── @/lib/api/watchlist ───

export class MockAddWatchlistError extends Error {
    code: string
    constructor(message: string, code: string) {
        super(message)
        this.code = code
    }
}

export class MockRemoveWatchlistError extends Error {
    code: string
    constructor(message: string, code: string) {
        super(message)
        this.code = code
    }
}

export const mockGetWatchlistItems = mock(
    (): Promise<unknown[]> => Promise.resolve([]),
)
// biome-ignore lint: mock functions need flexible typing
export const mockAddToWatchlist = mock((): Promise<any> => Promise.resolve({}))
export const mockRemoveFromWatchlist = mock(() => Promise.resolve())

// ─── @/lib/market-data/history ───

export const mockGetStockHistory = mock(
    (): Promise<{
        symbol: string
        period: string
        points: unknown[]
    }> =>
        Promise.resolve({
            symbol: 'AAPL',
            period: '1M',
            points: [],
        }),
)

// ─── @/lib/market-data/stock-info ───

export const mockGetStockInfo = mock(
    (): Promise<Record<string, never>> => Promise.resolve({}),
)

// ─── @/lib/ai/session ───

export class MockSessionError extends Error {
    code: string
    constructor(message: string, code: string) {
        super(message)
        this.code = code
        this.name = 'SessionError'
    }
}

export const mockListSessions = mock(
    (): Promise<unknown[]> => Promise.resolve([]),
)
export const mockListAllSessions = mock(() => Promise.resolve([]))
export const mockCreateSession = mock(
    (): Promise<{
        id: string
        symbol: string
        title: string
        createdAt: Date
        updatedAt: Date
    }> =>
        Promise.resolve({
            id: 'session-new',
            symbol: 'AAPL',
            title: 'Test Session',
            createdAt: new Date(),
            updatedAt: new Date(),
        }),
)
export const mockDeleteSession = mock(() => Promise.resolve())
export const mockRenameSession = mock(
    (): Promise<{
        id: string
        symbol: string
        title: string
        createdAt: Date
        updatedAt: Date
    }> =>
        Promise.resolve({
            id: 'session-1',
            symbol: 'AAPL',
            title: 'New Title',
            createdAt: new Date(),
            updatedAt: new Date(),
        }),
)
export const mockTouchSession = mock(() => Promise.resolve())
export const mockClearChannelSession = mock(() =>
    Promise.resolve({ id: 'cleared-session-1' }),
)
export const mockLoadMessages = mock(
    (): Promise<unknown[]> => Promise.resolve([]),
)
export const mockLoadMessageManifest = mock(
    (): Promise<{
        version: number
        runId: string
        manifest: unknown
    } | null> => Promise.resolve(null),
)
export const mockAppendMessage = mock(() => Promise.resolve())
export const mockSaveMessageManifest = mock(() => Promise.resolve())
export const mockTruncateMessages = mock((messages: unknown[]) => messages)
export const mockLoadSessionError = mock(
    (): Promise<{ message: string; name: string; code?: string } | null> =>
        Promise.resolve(null),
)
export const mockSaveSessionError = mock(() => Promise.resolve())
export const mockClearSessionError = mock(() => Promise.resolve())

// ─── @/lib/ai/session — loadMessagesForTranscript ───

export const mockLoadMessagesForTranscript = mock(() => Promise.resolve([]))

// ─── @/core/ai/memory (barrel) ───

export const mockGetSlotContent = mock(() =>
    Promise.resolve(null as string | null),
)
export const mockWriteSlot = mock(() => Promise.resolve())
export const mockGetSlotHistory = mock(() =>
    Promise.resolve(
        [] as Array<{
            id: string
            slot: string
            content: string
            author: string
            reason: string | null
            createdAt: Date
        }>,
    ),
)
export const mockLoadMemoryContext = mock(() => Promise.resolve(''))
export const mockCreateMemoryTools = mock(() => ({}))
export const mockCreateHistoryTool = mock(() => ({}))

// ─── @/lib/ai/prompts ───

export const mockBuildAgentSystemPrompt = mock(
    (
        _symbol: string,
        _name?: string,
        _options?: { readonly memoryContext?: string },
    ) => 'mock system prompt',
)
export const mockBuildGlobalSystemPrompt = mock(() => 'global system prompt')

// ─── @/lib/ai/tools ───

export const mockCreateTools = mock(() => ({}))

// ─── ai (Vercel AI SDK) ───

export const mockGenerateText = mock(() =>
    Promise.resolve({ text: 'mock report content' }),
)

// streamText mock — must return object with toUIMessageStreamResponse for chat endpoint
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

export const mockConvertToModelMessages = mock(
    async (messages: unknown[]) => messages,
)
export const mockStepCountIs = mock((_count: number) => () => false)
export const mockTool = mock((config: unknown) => config)

// generateId — returns a stable mock ID
export const mockGenerateId = mock(() => 'mock-id-1')

// ─── @/lib/ai/providers ───

export const mockGetModel = mock(
    (_slotOrProvider: string, _modelId?: string) => ({ modelId: 'mock-model' }),
)
export const mockGetEmbeddingModel = mock(() => ({ modelId: 'mock-embedding' }))

// ─── Alpaca Client mocks ───

export const mockGetAccount = mock(
    (): Promise<{
        equity: number
        cash: number
        buyingPower: number
        lastEquity: number
        longMarketValue: number
    }> =>
        Promise.resolve({
            equity: 100000,
            cash: 50000,
            buyingPower: 100000,
            lastEquity: 99500,
            longMarketValue: 50000,
        }),
)
// biome-ignore lint: mock functions need flexible typing
export const mockGetPositions = mock((): Promise<any[]> => Promise.resolve([]))
// biome-ignore lint: mock functions need flexible typing
export const mockGetPosition = mock((): Promise<any> => Promise.resolve(null))
// biome-ignore lint: mock functions need flexible typing
export const mockGetOrders = mock((): Promise<any[]> => Promise.resolve([]))
export const mockAlpacaIsConfigured = mock(() => true)

// ─── @/lib/ai/research ───

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

export const mockCreateDefaultResearchDeps = mock(() => ({
    searchWeb: mock(() => Promise.resolve({ results: [] })),
    readPage: mock(() =>
        Promise.resolve({
            content: '',
            bytesFetched: 0,
            truncated: false,
            source: 'direct',
        }),
    ),
    summarize: mock(() => Promise.resolve('')),
    generateText: mock(() => Promise.resolve({ text: '' })),
    searchModel: { modelId: 'mock-search-model' },
}))

// ─── @/core/ai/chat (generate + finalize) ───

export const mockFinalizeChatRound = mock(() => Promise.resolve())

export const mockChatGenerate = mock(() =>
    Promise.resolve({
        text: 'mock generate response',
        responseMessage: {
            id: 'mock-gen-id',
            role: 'assistant',
            parts: [{ type: 'text', text: 'mock generate response' }],
        },
    }),
)

// ─── @/core/ai/runtime ───

export const mockRuntimeFinalize = mock(() => Promise.resolve())

export const mockRuntimeConsumeStream = mock(() =>
    Promise.resolve({
        text: 'mock pipeline response',
        responseMessage: {
            id: 'mock-resp-id',
            role: 'assistant',
            parts: [{ type: 'text', text: 'mock pipeline response' }],
            createdAt: new Date(),
        },
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 50 },
        contextManifest: {
            runId: 'run-1',
            createdAt: new Date().toISOString(),
            input: {} as never,
            pluginOutputs: [],
            assembledContext: {} as never,
            modelRequest: {} as never,
        },
    }),
)

export const mockRuntimeChat = mock(() =>
    Promise.resolve({
        streamResult: {
            text: Promise.resolve('mock pipeline response'),
            usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
            steps: Promise.resolve([]),
            toUIMessageStreamResponse: (_opts?: unknown) =>
                new Response('mock stream', {
                    headers: { 'Content-Type': 'text/event-stream' },
                }),
            toUIMessageStream: (_opts?: unknown) => new ReadableStream(),
        },
        sessionId: 'session-1',
        consumeStream: mockRuntimeConsumeStream,
        finalize: mockRuntimeFinalize,
        getContextManifest: () => ({
            runId: 'run-1',
            createdAt: new Date().toISOString(),
            input: {} as never,
            pluginOutputs: [],
            assembledContext: {} as never,
            modelRequest: {} as never,
        }),
    }),
)

export const mockRuntime = {
    chat: mockRuntimeChat,
    dispose: mock(() => Promise.resolve()),
}

export const mockCreateAIRuntime = mock(() => Promise.resolve(mockRuntime))

// ─── @/core/ai/presets ───

export const mockTradingAgentPreset = mock(() => [])
export const mockAutoTradingAgentPreset = mock(() => [])

// ─── @/lib/market-data/search ───

// biome-ignore lint: mock functions need flexible typing
export const mockSearchStocks = mock((): Promise<any[]> => Promise.resolve([]))

// ─── @/core/cron/service ───

export const mockCreateCronJob = mock(() =>
    Promise.resolve({ id: 'cron-1', name: 'test', enabled: true }),
)
export const mockListCronJobs = mock(() => Promise.resolve([]))
export const mockUpdateCronJob = mock(() =>
    Promise.resolve({ id: 'cron-1', enabled: false }),
)
export const mockDeleteCronJob = mock(() => Promise.resolve({ id: 'cron-1' }))
export const mockGetCronJob = mock(() => Promise.resolve(null))
export const mockCreateCronJobRun = mock(() =>
    Promise.resolve({ id: 'run-1', jobId: 'cron-1', status: 'success' }),
)
export const mockListCronJobRuns = mock(() =>
    Promise.resolve({ runs: [], total: 0 }),
)
export const mockListAllRuns = mock(() =>
    Promise.resolve({ runs: [], total: 0 }),
)
