import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { AgentRunStore } from '@/core/ai/agent-run'
import type {
    AgentRunTracePayload,
    TracePhase,
    TraceStatus,
} from '@/core/ai/agent-run-trace/types'
import {
    mockConvertToModelMessages,
    mockGenerateText,
    mockStepCountIs,
    mockStreamText,
    mockTool,
} from './helpers/mock-boundaries'

const mockLoadMemoryContext = mock(async () => '## User Profile\nprefers ETFs')
const mockSessionCreate = mock(async () => ({
    id: 'session-new',
    symbol: 'AAPL',
    title: 'Test Session',
    createdAt: new Date(),
    updatedAt: new Date(),
}))
const mockSessionLoadMessages = mock(async () => [])
const mockSessionAppendMessage = mock(async () => {})
const mockSessionTouchSession = mock(async () => {})
const mockSessionSaveSessionError = mock(async () => {})
const mockSessionClearSessionError = mock(async () => {})

mock.module('../../src/core/ai/memory/loader', () => ({
    loadMemoryContext: mockLoadMemoryContext,
}))

mock.module('../../src/core/ai/session', () => ({
    createSession: mockSessionCreate,
    loadMessages: mockSessionLoadMessages,
    appendMessage: mockSessionAppendMessage,
    touchSession: mockSessionTouchSession,
    saveSessionError: mockSessionSaveSessionError,
    clearSessionError: mockSessionClearSessionError,
}))

mock.module('../../src/core/ai/presets/trading-agent', () => ({
    tradingAgentPreset: mock(() => [
        {
            name: 'prompt',
            contribute: () => ({
                segments: [
                    {
                        id: 'base',
                        target: 'system',
                        kind: 'system.base',
                        payload: {
                            format: 'text',
                            text: 'base prompt',
                        },
                        source: { plugin: 'prompt' },
                        priority: 'required',
                        cacheability: 'stable',
                        compactability: 'preserve',
                    },
                    {
                        id: 'memory',
                        target: 'system',
                        kind: 'memory.long_lived',
                        payload: {
                            format: 'text',
                            text: 'memory context',
                        },
                        source: { plugin: 'prompt' },
                        priority: 'high',
                        cacheability: 'session',
                        compactability: 'summarize',
                    },
                ],
            }),
        },
        {
            name: 'session',
            contribute: (ctx: { rawMessages: unknown[] }) => ({
                segments: [
                    {
                        id: 'history',
                        target: 'messages',
                        kind: 'history.recent',
                        payload: {
                            format: 'messages',
                            messages: ctx.rawMessages,
                        },
                        source: { plugin: 'session' },
                        priority: 'high',
                        cacheability: 'session',
                        compactability: 'summarize',
                    },
                ],
            }),
        },
        {
            name: 'trading',
            contribute: () => ({
                tools: [
                    {
                        name: 'trade-tool',
                        definition: { tool: {} },
                        source: 'trading',
                        manifestSpec: { description: 'trade tool' },
                    },
                ],
                params: { maxSteps: 50 },
            }),
        },
    ]),
}))

mock.module('../../src/core/ai/presets/auto-trading-agent', () => ({
    autoTradingAgentPreset: mock(() => [
        {
            name: 'live',
            contribute: () => ({
                segments: [
                    {
                        id: 'live',
                        target: 'system',
                        kind: 'live.runtime',
                        payload: {
                            format: 'text',
                            text: 'live runtime context',
                        },
                        source: { plugin: 'live' },
                        priority: 'high',
                        cacheability: 'volatile',
                        compactability: 'preserve',
                    },
                ],
                params: { maxSteps: 70 },
            }),
        },
    ]),
}))

mock.module('ai', () => ({
    generateText: mockGenerateText,
    streamText: mockStreamText,
    tool: mockTool,
    convertToModelMessages: mockConvertToModelMessages,
    stepCountIs: mockStepCountIs,
}))

function createFakeAgentRunStore(): AgentRunStore {
    return {
        createRunningRun: mock(() => Promise.resolve()),
        createFailedRun: mock(async (input) => ({
            runId: input.runId ?? 'generated-failed-run',
        })),
        attachSession: mock(() => Promise.resolve()),
        succeedIfRunning: mock(() => Promise.resolve()),
        failIfRunning: mock(() => Promise.resolve()),
        recordWarnings: mock(() => Promise.resolve()),
        reconcileStaleRunningRuns: mock(() => Promise.resolve({ count: 0 })),
    }
}

function createFakeTraceRecorder() {
    const traces = new Map<string, AgentRunTracePayload>()
    return {
        traces,
        startRun: mock((runId: string) => {
            traces.set(runId, {
                version: 1,
                runId,
                traceStatus: 'recording',
                runOutcome: 'unknown',
                currentPhase: 'created',
                completedPhases: [],
                compaction: { applied: false, reason: 'not_implemented' },
                updatedAt: new Date().toISOString(),
            })
            return Promise.resolve()
        }),
        checkpoint: mock(
            (
                runId: string,
                phase: TracePhase,
                patch: Partial<AgentRunTracePayload>,
                status: TraceStatus = 'recording',
            ) => {
                const existing = traces.get(runId)
                if (!existing) throw new Error(`missing trace ${runId}`)
                traces.set(runId, {
                    ...existing,
                    ...patch,
                    cache: patch.cache
                        ? { ...existing.cache, ...patch.cache }
                        : existing.cache,
                    traceStatus: status,
                    currentPhase: phase,
                    completedPhases: Array.from(
                        new Set([...existing.completedPhases, phase]),
                    ),
                    updatedAt: new Date().toISOString(),
                })
                return Promise.resolve()
            },
        ),
        recordFailure: mock(() => Promise.resolve()),
        recordMinimalFailure: mock(() => Promise.resolve()),
        markIncomplete: mock(() => Promise.resolve()),
    }
}

async function loadModules() {
    const runtimeMod = await import('../../src/core/ai/runtime')
    const tradingPresetMod = await import(
        '../../src/core/ai/presets/trading-agent'
    )
    const autoTradingPresetMod = await import(
        '../../src/core/ai/presets/auto-trading-agent'
    )

    return {
        createAIRuntime: runtimeMod.createAIRuntime,
        tradingAgentPreset: tradingPresetMod.tradingAgentPreset,
        autoTradingAgentPreset: autoTradingPresetMod.autoTradingAgentPreset,
    }
}

describe('ai context visibility integration', () => {
    beforeEach(() => {
        mockLoadMemoryContext.mockReset()
        mockSessionCreate.mockReset()
        mockSessionLoadMessages.mockReset()
        mockSessionAppendMessage.mockReset()
        mockSessionTouchSession.mockReset()
        mockSessionSaveSessionError.mockReset()
        mockSessionClearSessionError.mockReset()
        mockConvertToModelMessages.mockReset()
        mockStepCountIs.mockReset()
        mockStreamText.mockReset()

        mockLoadMemoryContext.mockResolvedValue('## User Profile\nprefers ETFs')
        mockSessionCreate.mockResolvedValue({
            id: 'session-new',
            symbol: 'AAPL',
            title: 'Test Session',
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        mockSessionLoadMessages.mockResolvedValue([])
        mockSessionAppendMessage.mockResolvedValue(undefined)
        mockSessionTouchSession.mockResolvedValue(undefined)
        mockSessionSaveSessionError.mockResolvedValue(undefined)
        mockSessionClearSessionError.mockResolvedValue(undefined)

        mockGenerateText.mockReset()
        mockTool.mockReset()
        mockConvertToModelMessages.mockImplementation(
            async (messages) => messages,
        )
        mockStepCountIs.mockImplementation((_count: number) => () => false)
        mockGenerateText.mockResolvedValue({ text: 'mock summary' })
        mockTool.mockImplementation((config) => config)
        mockStreamText.mockImplementation(() => ({
            text: Promise.resolve('mock stream text'),
            usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
            steps: Promise.resolve([]),
            toUIMessageStream: (opts?: {
                onFinish?: (payload: {
                    responseMessage: {
                        id: string
                        role: 'assistant'
                        parts: Array<{ type: 'text'; text: string }>
                    }
                }) => void
            }) =>
                new ReadableStream({
                    start(controller) {
                        opts?.onFinish?.({
                            responseMessage: {
                                id: 'assistant-1',
                                role: 'assistant',
                                parts: [
                                    {
                                        type: 'text',
                                        text: 'mock stream text',
                                    },
                                ],
                            },
                        })
                        controller.close()
                    },
                }),
            toUIMessageStreamResponse: (_opts?: unknown) =>
                new Response('mock stream', {
                    headers: { 'Content-Type': 'text/event-stream' },
                }),
        }))
    })

    test('trading-agent trace includes base prompt, memory, history, tools, resolved params, and cache metadata', async () => {
        const { createAIRuntime, tradingAgentPreset } = await loadModules()
        const traceRecorder = createFakeTraceRecorder()
        const runtime = await createAIRuntime({
            model: {
                provider: 'anthropic',
                modelId: 'claude-sonnet-4-6',
            } as Parameters<typeof createAIRuntime>[0]['model'],
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: traceRecorder as never,
            plugins: tradingAgentPreset({
                toolDeps: {
                    getQuote: async () => ({
                        price: 100,
                        change: 0,
                        volume: 1,
                    }),
                    getInfo: async () => ({
                        name: 'Apple',
                        pe: 20,
                        marketCap: 1,
                        eps: 1,
                        dividendYield: 0,
                        sector: 'Tech',
                    }),
                    getHistoryRaw: async () => [],
                    getNews: async () => [],
                    searchStocks: async () => [
                        { symbol: 'AAPL', name: 'Apple' },
                    ],
                },
                createResearchToolsFactory: () => ({}),
            }),
        })

        const output = await runtime.chat({
            sessionId: 's1',
            messages: [
                {
                    id: 'u1',
                    role: 'user',
                    parts: [{ type: 'text', text: 'AAPL 怎么看？' }],
                },
            ],
            symbol: 'AAPL',
            channel: 'web',
            mode: 'conversation',
        })
        await output.consumeStream()
        const trace = traceRecorder.traces.get(output.runId)

        expect(trace?.plugins?.contributions.length).toBeGreaterThan(0)
        expect(
            trace?.prompt?.segments.some(
                (segment) => segment.kind === 'system.base',
            ),
        ).toBe(true)
        expect(
            trace?.prompt?.segments.some(
                (segment) => segment.kind === 'memory.long_lived',
            ),
        ).toBe(true)
        expect(
            trace?.prompt?.segments.some(
                (segment) => segment.kind === 'history.recent',
            ),
        ).toBe(true)
        expect(trace?.prompt?.finalInput.tools.length).toBeGreaterThan(0)
        expect(trace?.prompt?.finalInput.params.resolved.maxSteps).toBe(50)
        expect(
            trace?.prompt?.finalInput.params.resolved.maxTokens,
        ).toBeUndefined()
        expect(trace?.cache?.plan?.stableCoreSegmentIds).toContain('base')
        expect(trace?.cache?.plan?.cacheableSessionSegmentIds).toContain(
            'memory',
        )
        expect(trace?.cache?.providerRequest?.cacheControlBreakpoints).toEqual({
            count: 0,
            sources: {
                providerMessages: 0,
                tools: 0,
                cachePlan: 2,
            },
        })
        expect(trace?.cache?.plan?.eligibility.cacheExpected).toBe(false)
        expect(trace?.cache?.plan?.eligibility.cacheExpectationReason).toBe(
            'below_cache_threshold',
        )
        expect(trace?.cache?.result).toMatchObject({
            cacheObserved: false,
            evidenceSource: 'none',
            rolloutGateStatus: 'observe-only',
            circuitBreakerState: 'closed',
        })
        expect(mockStreamText).toHaveBeenCalledTimes(1)
        expect(
            'maxOutputTokens' in
                (mockStreamText.mock.calls[0][0] as Record<string, unknown>),
        ).toBe(false)

        await runtime.dispose()
    })

    test('auto-trading trace includes live runtime segment', async () => {
        const { createAIRuntime, autoTradingAgentPreset } = await loadModules()
        const traceRecorder = createFakeTraceRecorder()
        const runtime = await createAIRuntime({
            model: {} as Parameters<typeof createAIRuntime>[0]['model'],
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: traceRecorder as never,
            plugins: autoTradingAgentPreset({
                alpacaClient: {
                    getAccount: async () => ({ equity: 100000 }),
                    getOrders: async () => [],
                    getLastTrade: async () => ({ price: 100 }),
                    createOrder: async () => null,
                    isConfigured: () => true,
                } as never,
                db: {
                    order: {
                        findUnique: async () => null,
                        create: async () => ({}),
                        update: async () => ({}),
                        findMany: async () => [],
                    },
                    tradingAgentConfig: {
                        findUnique: async () => ({ value: '100000' }),
                        create: async () => ({}),
                    },
                } as never,
                toolDeps: {
                    getQuote: async () => ({
                        price: 100,
                        change: 0,
                        volume: 1,
                    }),
                    getInfo: async () => ({
                        name: 'Apple',
                        pe: 20,
                        marketCap: 1,
                        eps: 1,
                        dividendYield: 0,
                        sector: 'Tech',
                    }),
                    getHistoryRaw: async () => [],
                    getNews: async () => [],
                    searchStocks: async () => [
                        { symbol: 'AAPL', name: 'Apple' },
                    ],
                },
                memoryDeps: {
                    db: {
                        memoryVersion: {
                            findFirst: async () => ({
                                content: 'existing strategy',
                            }),
                            create: async () => ({ id: 'v1' }),
                        },
                    } as never,
                },
                researchDeps: {
                    searchWeb: async () => ({ results: [] }),
                    generateText: async () => ({ text: 'mock summary' }),
                    searchModel: { modelId: 'mock-search-model' } as never,
                    readPage: async () => ({
                        content: '',
                        bytesFetched: 0,
                        truncated: false,
                        source: 'direct' as const,
                    }),
                    summarize: async () => '',
                },
            }),
        })

        const output = await runtime.chat({
            sessionId: 's1',
            messages: [
                {
                    id: 'u1',
                    role: 'user',
                    parts: [{ type: 'text', text: 'run' }],
                },
            ],
            channel: 'cron',
            mode: 'trigger',
            agentType: 'auto-trading-agent',
        })

        const trace = traceRecorder.traces.get(output.runId)
        const liveSegment = trace?.prompt?.segments.find(
            (segment) => segment.kind === 'live.runtime',
        )

        expect(liveSegment).toBeDefined()
        expect(liveSegment?.cacheability).toBe('volatile')
        expect(trace?.prompt?.finalInput.params.resolved.maxSteps).toBe(70)
        expect(
            trace?.prompt?.finalInput.params.resolved.maxTokens,
        ).toBeUndefined()

        await runtime.dispose()
    })
})
