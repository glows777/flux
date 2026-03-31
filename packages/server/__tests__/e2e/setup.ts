/**
 * E2E test setup (preload file)
 *
 * Sets fallback env vars for external boundaries.
 * No happy-dom or jest-dom — these are pure API tests.
 *
 * IMPORTANT: mock.module() calls MUST live in the preload file
 * (this file) or in individual test files. Bun does NOT apply
 * mock.module() from imported helper files.
 */

import { mock } from 'bun:test'
import { assertTestDatabase } from '../helpers/assert-test-db'
import {
    mockAppendDocument,
    mockAppendTranscript,
    mockCleanMessages,
    mockConvertToModelMessages,
    mockCreateMemoryTools,
    // research mocks
    mockCreateResearchTools,
    mockDeleteDocument,
    mockFinnhubGetCompanyNews,
    mockFinnhubGetQuote,
    mockFinnhubGetDailyHistory,
    mockFinnhubGetCompanyOverview,
    mockFlushReindex,
    mockGenerateEmbedding,
    mockGenerateId,
    mockGenerateText,
    mockGetDocumentDetail,
    mockGetEmbeddingModel,
    mockGetModel,
    mockGetToolName,
    mockIsToolUIPart,
    mockListDocuments,
    mockLoadMemoryContext,
    // memory mocks
    mockReadDocument,
    mockReindexDocument,
    mockScheduleReindex,
    mockSearchMemory,
    mockStepCountIs,
    mockStreamText,
    mockSyncPortfolioDocument,
    mockTool,
    mockWriteDocument,
    mockYahooChart,
    mockYahooQuote,
    mockYahooQuoteSummary,
    // chat generate mock
    mockChatGenerate,
    // runtime mocks
    mockCreateAIRuntime,
    mockRuntime,
    // preset mocks
    mockTradingAgentPreset,
    mockAutoTradingAgentPreset,
    // cron service mocks
    mockCreateCronJob,
    mockListCronJobs,
    mockUpdateCronJob,
    mockDeleteCronJob,
    mockGetCronJob,
    // Alpaca client mocks
    mockGetAccount,
    mockGetPositions,
    mockGetPosition,
    mockGetOrders,
    mockAlpacaIsConfigured,
    mockCreateOrder,
    mockCancelOrder,
    mockClosePosition,
} from './helpers/mock-boundaries'

// ─── Safety guard: refuse to run against non-test database ───

assertTestDatabase()

// ─── Env vars ───

if (!process.env.FINNHUB_API_KEY) {
    process.env.FINNHUB_API_KEY = 'test-e2e-key'
}
if (!process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = 'test-e2e-anthropic-key'
}
if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = 'test-e2e-openai-key'
}
if (!process.env.OPENAI_BASE_URL) {
    process.env.OPENAI_BASE_URL = 'http://localhost'
}

// ─── Module mocks (must be in preload or test file for bun) ───

mock.module('yahoo-finance2', () => ({
    default: class MockYahooFinance {
        quote = mockYahooQuote
        chart = mockYahooChart
        quoteSummary = mockYahooQuoteSummary
    },
}))

mock.module('@/core/market-data/common/finnhub-client', () => ({
    FinnhubClient: class MockFinnhubClient {
        getCompanyNews = mockFinnhubGetCompanyNews
        getQuote = mockFinnhubGetQuote
        getDailyHistory = mockFinnhubGetDailyHistory
        getCompanyOverview = mockFinnhubGetCompanyOverview
    },
}))

mock.module('ai', () => ({
    generateText: mockGenerateText,
    streamText: mockStreamText,
    tool: mockTool,
    convertToModelMessages: mockConvertToModelMessages,
    stepCountIs: mockStepCountIs,
    isToolUIPart: mockIsToolUIPart,
    getToolName: mockGetToolName,
    generateId: mockGenerateId,
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
    MEMORY_PATHS: {
        PROFILE: 'profile.md',
        PORTFOLIO: 'portfolio.md',
        WATCHLIST_CONTEXT: 'watchlist-context.md',
        TRADING_LESSONS: 'trading-lessons.md',
    },
    MEMORY_DIRS: { OPINIONS: 'opinions', DECISIONS: 'decisions', LOG: 'log' },
}))

mock.module('@/core/ai/research', () => ({
    createResearchTools: mockCreateResearchTools,
    createDefaultResearchDeps: mock(() => ({})),
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
    X_SEARCH_CONFIG: { enableImageUnderstanding: true, enableVideoUnderstanding: true },
    X_SEARCH_SYSTEM_PROMPT: 'mock prompt',
}))

// Note: search service uses yahoo-finance2 (already mocked above) + prisma (real DB)
// No separate mock needed since no E2E test overrides search behavior directly

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

mock.module('@/core/broker/alpaca-client', () => ({
    getAlpacaClient: () => ({
        getAccount: mockGetAccount,
        getPositions: mockGetPositions,
        getPosition: mockGetPosition,
        getOrders: mockGetOrders,
        isConfigured: mockAlpacaIsConfigured,
        createOrder: mockCreateOrder,
        cancelOrder: mockCancelOrder,
        closePosition: mockClosePosition,
    }),
    createAlpacaClient: () => ({
        getAccount: mockGetAccount,
        getPositions: mockGetPositions,
        getPosition: mockGetPosition,
        getOrders: mockGetOrders,
        isConfigured: mockAlpacaIsConfigured,
        createOrder: mockCreateOrder,
        cancelOrder: mockCancelOrder,
        closePosition: mockClosePosition,
    }),
    resetAlpacaClient: mock(() => {}),
}))
