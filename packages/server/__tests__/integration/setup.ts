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
    // db mocks
    mockWatchlistFindMany,
    mockWatchlistFindUnique,
    mockWatchlistCreate,
    mockWatchlistDelete,
    mockAIReportFindFirst,
    mockAIReportCreate,
    mockAIReportDeleteMany,
    // sync mocks
    mockGetQuoteWithCache,
    mockGetHistoryWithCache,
    mockGetInfoWithCache,
    // yahoo-finance2 mock
    mockYahooQuoteFn,
    // news mock
    mockGetStockNews,
    // macro mock
    mockGetMacroIndicators,
    // watchlist API mocks
    mockGetWatchlistItems,
    mockAddToWatchlist,
    mockRemoveFromWatchlist,
    MockAddWatchlistError,
    MockRemoveWatchlistError,
    // history mock
    mockGetStockHistory,
    // stock-info mock
    mockGetStockInfo,
    // brief mock
    mockGenerateBrief,
    // cache mock
    mockGetReportWithCache,
    // session mocks
    MockSessionError,
    mockListSessions,
    mockListAllSessions,
    mockCreateSession,
    mockDeleteSession,
    mockRenameSession,
    mockTouchSession,
    mockClearChannelSession,
    mockLoadMessages,
    mockAppendMessage,
    mockTruncateMessages,
    // session — loadMessagesForTranscript
    mockLoadMessagesForTranscript,
    // memory (barrel) mocks
    mockReadDocument,
    mockGetDocumentDetail,
    mockWriteDocument,
    mockAppendDocument,
    mockDeleteDocument,
    mockListDocuments,
    mockSearchMemory,
    mockLoadMemoryContext,
    mockSyncPortfolioDocument,
    mockGenerateEmbedding,
    mockCreateMemoryTools,
    mockCleanMessages,
    mockAppendTranscript,
    mockReindexDocument,
    mockScheduleReindex,
    mockFlushReindex,
    // prompts mock
    mockBuildAgentSystemPrompt,
    mockBuildGlobalSystemPrompt,
    // tools mock
    mockCreateTools,
    // ai mocks
    mockGenerateText,
    mockStreamText,
    mockConvertToModelMessages,
    mockStepCountIs,
    mockGenerateId,
    // providers mock
    mockGetModel,
    mockGetEmbeddingModel,
    // search mock
    mockSearchStocks,
    // research mocks
    mockCreateResearchTools,
    mockCreateDefaultResearchDeps,
    // chat generate mock
    mockChatGenerate,
    // runtime mocks
    mockCreateAIRuntime,
    mockRuntime,
    // preset mocks
    mockTradingAgentPreset,
    mockAutoTradingAgentPreset,
    // Alpaca client mocks
    mockGetAccount,
    mockGetPositions,
    mockGetPosition,
    mockGetOrders,
    mockAlpacaIsConfigured,
    // finance (earnings) mocks
    mockGetAvailableFiscalQuarters,
    mockGetL1WithCache,
    mockGetL2WithCache,
    mockGetQuartersWithCache,
    mockSaveTranscript,
    MockFmpError,
    // cron service mocks
    mockCreateCronJob,
    mockListCronJobs,
    mockUpdateCronJob,
    mockDeleteCronJob,
    mockGetCronJob,
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
    searchStocks: mockSearchStocks,
    getMacro: mockGetMacroIndicators,
    getMacroIndicators: mockGetMacroIndicators,
    VIX_DISPLAY_NAME: '恐慌指数',
    findVixFromMacro: (indicators: ReadonlyArray<{ sym: string; val: string }>) =>
        indicators.find(m => m.sym === '恐慌指数'),
    VALID_PERIODS: ['1D', '1W', '1M', '3M', 'YTD', '1Y'],
    getDaysForPeriod: mock((period: string) => {
        const map: Record<string, number> = { '1D': 1, '1W': 5, '1M': 22, '3M': 65, '1Y': 252 }
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

mock.module('@/core/ai/brief', () => ({
    generateBrief: mockGenerateBrief,
}))

mock.module('@/core/ai/cache', () => ({
    getReportWithCache: mockGetReportWithCache,
    getReportFromCache: mock(() => Promise.resolve(null)),
    REPORT_TTL_MS: 24 * 60 * 60 * 1000,
}))


mock.module('@/core/ai/providers', () => ({
    getModel: mockGetModel,
    getEmbeddingModel: mockGetEmbeddingModel,
    THINKING_BUDGET: 10240,
    resetProviders: mock(() => {}),
}))

mock.module('@/core/ai/memory', () => ({
    readDocument: mockReadDocument,
    getDocumentDetail: mockGetDocumentDetail,
    writeDocument: mockWriteDocument,
    appendDocument: mockAppendDocument,
    deleteDocument: mockDeleteDocument,
    listDocuments: mockListDocuments,
    searchMemory: mockSearchMemory,
    loadMemoryContext: mockLoadMemoryContext,
    syncPortfolioDocument: mockSyncPortfolioDocument,
    generateEmbedding: mockGenerateEmbedding,
    createMemoryTools: mockCreateMemoryTools,
    cleanMessages: mockCleanMessages,
    appendTranscript: mockAppendTranscript,
    reindexDocument: mockReindexDocument,
    scheduleReindex: mockScheduleReindex,
    flushReindex: mockFlushReindex,
    MEMORY_PATHS: { PROFILE: 'profile.md', PORTFOLIO: 'portfolio.md', WATCHLIST_CONTEXT: 'watchlist-context.md' },
    MEMORY_DIRS: { OPINIONS: 'opinions', DECISIONS: 'decisions', LOG: 'log' },
}))

mock.module('@/core/ai/prompts', () => ({
    buildAgentSystemPrompt: mockBuildAgentSystemPrompt,
    buildGlobalSystemPrompt: mockBuildGlobalSystemPrompt,
    calculateIndicators: mock(() => ({ ma20: null, rsi: null, ma50: null, ma200: null, trendPosition: null, macd: null, support: null, resistance: null, volumeRatio: null })),
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
    RESEARCH_TIMEOUTS: { searchTavily: 15000, webSearch: 60000, webFetch: 30000, searchX: 60000 },
    PAGE_CONTENT_MAX_CHARS: 50000,
    WEB_SEARCH_MAX_STEPS: 8,
    FETCH_CACHE_TTL: 900000,
    FETCH_CACHE_MAX_SIZE: 100,
    X_SEARCH_CACHE_TTL: 300000,
    X_SEARCH_CACHE_MAX_SIZE: 50,
    X_SEARCH_CONFIG: { enableImageUnderstanding: true, enableVideoUnderstanding: true },
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
    loadMessagesForTranscript: mockLoadMessagesForTranscript,
    appendMessage: mockAppendMessage,
    truncateMessages: mockTruncateMessages,
}))

mock.module('ai', () => ({
    generateText: mockGenerateText,
    streamText: mockStreamText,
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

mock.module('@/core/finance', () => ({
    getAvailableFiscalQuarters: mockGetAvailableFiscalQuarters,
    getL1WithCache: mockGetL1WithCache,
    getL2WithCache: mockGetL2WithCache,
    getQuartersWithCache: mockGetQuartersWithCache,
    saveTranscript: mockSaveTranscript,
    FmpError: MockFmpError,
    FMP_ERROR_CODE_TO_STATUS: {
        CONFIG_ERROR: 500,
        API_ERROR: 502,
        RATE_LIMITED: 429,
        NOT_FOUND: 404,
        PARSE_ERROR: 502,
    },
}))

mock.module('@/core/cron/service', () => ({
    createCronJob: mockCreateCronJob,
    listCronJobs: mockListCronJobs,
    updateCronJob: mockUpdateCronJob,
    deleteCronJob: mockDeleteCronJob,
    getCronJob: mockGetCronJob,
}))

mock.module('@/core/ai/runtime/create', () => ({
    createAIRuntime: mockCreateAIRuntime,
}))

mock.module('@/core/ai/runtime', () => ({
    createAIRuntime: mockCreateAIRuntime,
    PluginError: class PluginError extends Error {
        constructor(message: string) { super(message); this.name = 'PluginError' }
    },
    ToolConflictError: class ToolConflictError extends Error {
        constructor(message: string) { super(message); this.name = 'ToolConflictError' }
    },
    DEFAULT_CHAT_PARAMS: { maxSteps: 20 },
}))

mock.module('@/core/ai/presets', () => ({
    tradingAgentPreset: mockTradingAgentPreset,
    autoTradingAgentPreset: mockAutoTradingAgentPreset,
}))
