/**
 * Integration test setup (preload file)
 *
 * IMPORTANT: mock.module() calls MUST live in the preload file
 * (this file) or in individual test files. Bun does NOT apply
 * mock.module() from imported helper files.
 *
 * All mock function references are imported from helpers/mock-boundaries.ts
 * so test files can import them to customize behavior per-test.
 */

import { mock } from 'bun:test'
import {
    MockAddWatchlistError,
    MockRemoveWatchlistError,
    // session mocks
    MockSessionError,
    mockAddToWatchlist,
    mockAIReportCreate,
    mockAIReportDeleteMany,
    mockAIReportFindFirst,
    mockAlpacaIsConfigured,
    mockAppendMessage,
    mockAutoTradingAgentPreset,
    // prompts mock
    mockBuildAgentSystemPrompt,
    mockBuildGlobalSystemPrompt,
    mockClearChannelSession,
    mockConvertToModelMessages,
    // runtime mocks
    mockCreateAIRuntime,
    // cron service mocks
    mockCreateCronJob,
    mockCreateCronJobRun,
    mockCreateDefaultResearchDeps,
    mockCreateHistoryTool,
    mockCreateMemoryTools,
    // research mocks
    mockCreateResearchTools,
    mockCreateSession,
    // tools mock
    mockCreateTools,
    mockDeleteCronJob,
    mockDeleteSession,
    mockGenerateId,
    // ai mocks
    mockGenerateText,
    // Alpaca client mocks
    mockGetAccount,
    mockGetCronJob,
    mockGetEmbeddingModel,
    mockGetHistoryWithCache,
    mockGetInfoWithCache,
    // macro mock
    mockGetMacroIndicators,
    // providers mock
    mockGetModel,
    mockGetOrders,
    mockGetPosition,
    mockGetPositions,
    // sync mocks
    mockGetQuoteWithCache,
    // memory (barrel) mocks
    mockGetSlotContent,
    mockGetSlotHistory,
    // history mock
    mockGetStockHistory,
    // stock-info mock
    mockGetStockInfo,
    // news mock
    mockGetStockNews,
    // watchlist API mocks
    mockGetWatchlistItems,
    mockListAllRuns,
    mockListAllSessions,
    mockListCronJobRuns,
    mockListCronJobs,
    mockClearSessionError,
    mockListSessions,
    mockLoadMemoryContext,
    mockLoadMessages,
    mockLoadMessageManifest,
    // session — loadMessagesForTranscript
    mockLoadMessagesForTranscript,
    mockLoadSessionError,
    mockSaveSessionError,
    mockSaveMessageManifest,
    mockRemoveFromWatchlist,
    mockRenameSession,
    // search mock
    mockSearchStocks,
    mockStepCountIs,
    mockStreamText,
    mockTool,
    mockTouchSession,
    // preset mocks
    mockTradingAgentPreset,
    mockTruncateMessages,
    mockUpdateCronJob,
    mockWatchlistCreate,
    mockWatchlistDelete,
    // db mocks
    mockWatchlistFindMany,
    mockWatchlistFindUnique,
    mockWriteSlot,
    // yahoo-finance2 mock
    mockYahooQuoteFn,
} from './helpers/mock-boundaries'

// ─── Env vars ───

if (!process.env.FINNHUB_API_KEY) {
    process.env.FINNHUB_API_KEY = 'test-integration-key'
}
if (!process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = 'test-integration-anthropic-key'
}
if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = 'test-integration-openai-key'
}
if (!process.env.OPENAI_BASE_URL) {
    process.env.OPENAI_BASE_URL = 'http://localhost'
}

// ─── Module mocks (must be in preload or test file for bun) ───

mock.module('@/core/db', () => ({
    prisma: {
        watchlist: {
            findMany: mockWatchlistFindMany,
            findUnique: mockWatchlistFindUnique,
            create: mockWatchlistCreate,
            delete: mockWatchlistDelete,
        },
        aIReport: {
            findFirst: mockAIReportFindFirst,
            create: mockAIReportCreate,
            deleteMany: mockAIReportDeleteMany,
        },
        cronJob: {
            create: mockCreateCronJob,
            findMany: mockListCronJobs,
            update: mockUpdateCronJob,
            delete: mockDeleteCronJob,
            findUnique: mockGetCronJob,
            findFirst: mockGetCronJob,
            count: mock(() => Promise.resolve(0)),
        },
        cronJobRun: {
            create: mockCreateCronJobRun,
            findMany: mock(() => Promise.resolve([])),
            count: mock(() => Promise.resolve(0)),
        },
        chatSession: {
            findFirst: mock(() => Promise.resolve(null)),
            create: mock(() => Promise.resolve({ id: 'session-1' })),
        },
    },
}))

// Mock the NEW barrel export (callers import from '@/core/market-data')
mock.module('@/core/market-data', () => ({
    getQuote: mockGetQuoteWithCache,
    getQuoteWithCache: mockGetQuoteWithCache,
    getBatchQuotes: mock(() => Promise.resolve(new Map())),
    getHistory: mockGetStockHistory,
    getHistoryRaw: mockGetHistoryWithCache,
    getHistoryWithCache: mockGetHistoryWithCache,
    getInfo: mockGetInfoWithCache,
    getInfoWithCache: mockGetInfoWithCache,
    getNews: mockGetStockNews,
    getStockNews: mockGetStockNews,
    getStockInfo: mockGetStockInfo,
    getStockQuote: mockGetQuoteWithCache,
    searchStocks: mockSearchStocks,
    getMacro: mockGetMacroIndicators,
    getMacroIndicators: mockGetMacroIndicators,
    VIX_DISPLAY_NAME: '恐慌指数',
    findVixFromMacro: (
        indicators: ReadonlyArray<{ sym: string; val: string }>,
    ) => indicators.find((m) => m.sym === '恐慌指数'),
    VALID_PERIODS: ['1D', '1W', '1M', '3M', 'YTD', '1Y'],
    getDaysForPeriod: mock((period: string) => {
        const map: Record<string, number> = {
            '1D': 1,
            '1W': 5,
            '1M': 22,
            '3M': 65,
            '1Y': 252,
        }
        return map[period] ?? 22
    }),
    isValidSymbol: mock((s: string) => /^[A-Za-z0-9.\-^]{1,10}$/.test(s)),
    normalizeSymbol: mock((s: string) => s.trim().toUpperCase()),
    proxyFetch: mock(async (url: string) => globalThis.fetch(url)),
    clearMacroCache: mock(() => {}),
    clearQuoteCache: mock(() => {}),
    clearAllMemoryCaches: mock(() => {}),
}))

mock.module('yahoo-finance2', () => ({
    default: class MockYahooFinance {
        quote = mockYahooQuoteFn
    },
}))

mock.module('@/core/api/watchlist', () => ({
    getWatchlistItems: mockGetWatchlistItems,
    addToWatchlist: mockAddToWatchlist,
    removeFromWatchlist: mockRemoveFromWatchlist,
    AddWatchlistError: MockAddWatchlistError,
    RemoveWatchlistError: MockRemoveWatchlistError,
}))

mock.module('@/core/ai/providers', () => ({
    getModel: mockGetModel,
    getEmbeddingModel: mockGetEmbeddingModel,
    THINKING_BUDGET: 10240,
    resetProviders: mock(() => {}),
}))

mock.module('@/core/ai/memory', () => ({
    getSlotContent: mockGetSlotContent,
    writeSlot: mockWriteSlot,
    getSlotHistory: mockGetSlotHistory,
    loadMemoryContext: mockLoadMemoryContext,
    createMemoryTools: mockCreateMemoryTools,
    createHistoryTool: mockCreateHistoryTool,
    SlotContentTooLongError: class SlotContentTooLongError extends Error {
        slot: string
        actual: number
        limit: number
        constructor(slot: string, actual: number, limit: number) {
            super(`Slot "${slot}" content too long`)
            this.name = 'SlotContentTooLongError'
            this.slot = slot
            this.actual = actual
            this.limit = limit
        }
    },
    VALID_SLOTS: [
        'user_profile',
        'portfolio_thesis',
        'market_views',
        'active_focus',
        'lessons',
        'agent_strategy',
    ],
    SLOT_LIMITS: {
        user_profile: 500,
        market_views: 500,
        active_focus: 500,
        lessons: 1000,
        portfolio_thesis: 2000,
        agent_strategy: 2000,
    },
}))

mock.module('@/core/ai/prompts', () => ({
    buildAgentSystemPrompt: mockBuildAgentSystemPrompt,
    buildGlobalSystemPrompt: mockBuildGlobalSystemPrompt,
    calculateIndicators: mock(() => ({
        ma20: null,
        rsi: null,
        ma50: null,
        ma200: null,
        trendPosition: null,
        macd: null,
        support: null,
        resistance: null,
        volumeRatio: null,
    })),
    buildReportPrompt: mock(() => 'mock report prompt'),
}))

mock.module('@/core/ai/tools', () => ({
    createTools: mockCreateTools,
}))

mock.module('@/core/ai/research', () => ({
    createResearchTools: mockCreateResearchTools,
    createDefaultResearchDeps: mockCreateDefaultResearchDeps,
    createWebSearchTool: mock(() => ({})),
    createWebFetchTool: mock(() => ({})),
    createSearchXTool: mock(() => ({})),
    clearFetchCache: mock(() => {}),
    clearXSearchCache: mock(() => {}),
    getXSearchCacheSize: mock(() => 0),
    RESEARCH_TIMEOUTS: {
        searchTavily: 15000,
        webSearch: 60000,
        webFetch: 30000,
        searchX: 60000,
    },
    PAGE_CONTENT_MAX_CHARS: 50000,
    WEB_SEARCH_MAX_STEPS: 8,
    FETCH_CACHE_TTL: 900000,
    FETCH_CACHE_MAX_SIZE: 100,
    X_SEARCH_CACHE_TTL: 300000,
    X_SEARCH_CACHE_MAX_SIZE: 50,
    X_SEARCH_CONFIG: {
        enableImageUnderstanding: true,
        enableVideoUnderstanding: true,
    },
    X_SEARCH_SYSTEM_PROMPT: 'mock prompt',
}))

    mock.module('@/core/ai/session', () => ({
    SessionError: MockSessionError,
    listSessions: mockListSessions,
    listAllSessions: mockListAllSessions,
    createSession: mockCreateSession,
    deleteSession: mockDeleteSession,
    renameSession: mockRenameSession,
    touchSession: mockTouchSession,
    clearChannelSession: mockClearChannelSession,
    loadMessages: mockLoadMessages,
    loadMessageManifest: mockLoadMessageManifest,
    loadMessagesForTranscript: mockLoadMessagesForTranscript,
    appendMessage: mockAppendMessage,
    saveMessageManifest: mockSaveMessageManifest,
    truncateMessages: mockTruncateMessages,
    loadSessionError: mockLoadSessionError,
    saveSessionError: mockSaveSessionError,
    clearSessionError: mockClearSessionError,
}))

mock.module('ai', () => ({
    generateText: mockGenerateText,
    streamText: mockStreamText,
    tool: mockTool,
    convertToModelMessages: mockConvertToModelMessages,
    stepCountIs: mockStepCountIs,
    generateId: mockGenerateId,
}))

mock.module('@/core/broker/alpaca-client', () => ({
    getAlpacaClient: () => ({
        getAccount: mockGetAccount,
        getPositions: mockGetPositions,
        getPosition: mockGetPosition,
        getOrders: mockGetOrders,
        isConfigured: mockAlpacaIsConfigured,
    }),
    createAlpacaClient: () => ({
        getAccount: mockGetAccount,
        getPositions: mockGetPositions,
        getPosition: mockGetPosition,
        getOrders: mockGetOrders,
        isConfigured: mockAlpacaIsConfigured,
    }),
    resetAlpacaClient: mock(() => {}),
}))

mock.module('@/core/cron/service', () => ({
    createCronJob: mockCreateCronJob,
    listCronJobs: mockListCronJobs,
    updateCronJob: mockUpdateCronJob,
    deleteCronJob: mockDeleteCronJob,
    getCronJob: mockGetCronJob,
    listCronJobRuns: mockListCronJobRuns,
    listAllRuns: mockListAllRuns,
    createCronJobRun: mockCreateCronJobRun,
}))

mock.module('@/core/ai/runtime/create', () => ({
    createAIRuntime: mockCreateAIRuntime,
}))

mock.module('@/core/ai/runtime', () => ({
    createAIRuntime: mockCreateAIRuntime,
    PluginError: class PluginError extends Error {
        constructor(message: string) {
            super(message)
            this.name = 'PluginError'
        }
    },
    ToolConflictError: class ToolConflictError extends Error {
        constructor(message: string) {
            super(message)
            this.name = 'ToolConflictError'
        }
    },
    DEFAULT_CHAT_PARAMS: { maxSteps: 20 },
}))

mock.module('@/core/ai/presets', () => ({
    tradingAgentPreset: mockTradingAgentPreset,
    autoTradingAgentPreset: mockAutoTradingAgentPreset,
}))
