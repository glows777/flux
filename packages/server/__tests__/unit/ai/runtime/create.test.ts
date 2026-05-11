import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    mock,
    test,
} from 'bun:test'
import type { AgentRunStore } from '../../../../src/core/ai/agent-run'
import type { TraceRecorder } from '../../../../src/core/ai/agent-run-trace/recorder'
import type {
    AgentRunTracePayload,
    TracePhase,
    TraceStatus,
} from '../../../../src/core/ai/agent-run-trace/types'
import type {
    AIPlugin,
    CachePlanSnapshot,
} from '../../../../src/core/ai/runtime/types'

const mockConvertToModelMessages = mock(async (messages: unknown[]) => messages)
const mockStepCountIs = mock((_count: number) => () => false)

type StreamResultOverrides = {
    text?: string | Promise<string>
    usage?: { inputTokens?: number; outputTokens?: number }
    totalUsage?: Record<string, unknown>
    providerMetadata?: Record<string, unknown>
    steps?: unknown[]
}

function createMockStreamResult(overrides: StreamResultOverrides = {}) {
    const text =
        typeof overrides.text === 'string' ? overrides.text : 'mock text'
    const responseMessage = {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text }],
    }

    return {
        text: Promise.resolve(overrides.text ?? 'mock text'),
        usage: Promise.resolve(
            overrides.usage ?? { inputTokens: 10, outputTokens: 5 },
        ),
        totalUsage: Promise.resolve(overrides.totalUsage),
        providerMetadata: Promise.resolve(overrides.providerMetadata),
        steps: Promise.resolve(overrides.steps ?? []),
        toUIMessageStream: (opts?: {
            onFinish?: (payload: {
                responseMessage: typeof responseMessage
            }) => void
        }) =>
            new ReadableStream({
                start(controller) {
                    opts?.onFinish?.({ responseMessage })
                    controller.close()
                },
            }),
        toUIMessageStreamResponse: (_opts?: unknown) =>
            new Response('data: test\n\n', {
                headers: { 'Content-Type': 'text/event-stream' },
            }),
    }
}

const mockStreamText = mock(() => createMockStreamResult())

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

interface FakeTraceRecorder extends TraceRecorder {
    traces: Map<string, AgentRunTracePayload>
    checkpoints: Array<{
        runId: string
        phase: TracePhase
        patch: Partial<AgentRunTracePayload>
        status: TraceStatus
    }>
    startRun: ReturnType<typeof mock>
    checkpoint: ReturnType<typeof mock>
    markIncomplete: ReturnType<typeof mock>
}

let createdTraceRecorders: FakeTraceRecorder[] = []

function mergeTracePayload(
    existing: AgentRunTracePayload,
    phase: TracePhase,
    patch: Partial<AgentRunTracePayload>,
    status: TraceStatus,
): AgentRunTracePayload {
    return {
        ...existing,
        ...patch,
        cache: patch.cache
            ? { ...existing.cache, ...patch.cache }
            : existing.cache,
        currentPhase: phase,
        completedPhases: Array.from(
            new Set([...existing.completedPhases, phase]),
        ),
        traceStatus: status,
        runOutcome: patch.runOutcome ?? existing.runOutcome,
        updatedAt: new Date().toISOString(),
    }
}

function createFakeTraceRecorder(
    params: { failStart?: boolean; failCheckpointPhase?: TracePhase } = {},
): FakeTraceRecorder {
    const traces = new Map<string, AgentRunTracePayload>()
    const checkpoints: FakeTraceRecorder['checkpoints'] = []
    const recorder = {
        traces,
        checkpoints,
        startRun: mock(async (runId: string) => {
            if (params.failStart) throw new Error('trace start failed')
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
        }),
        checkpoint: mock(
            async (
                runId: string,
                phase: TracePhase,
                patch: Partial<AgentRunTracePayload>,
                status: TraceStatus = 'recording',
            ) => {
                if (params.failCheckpointPhase === phase) {
                    throw new Error(`trace checkpoint failed: ${phase}`)
                }
                checkpoints.push({ runId, phase, patch, status })
                const existing = traces.get(runId)
                if (!existing) throw new Error(`missing trace ${runId}`)
                if (existing.traceStatus !== 'recording') return
                traces.set(
                    runId,
                    mergeTracePayload(existing, phase, patch, status),
                )
            },
        ),
        markIncomplete: mock(async (runId: string, error: unknown) => {
            const existing = traces.get(runId)
            if (!existing) return
            traces.set(runId, {
                ...existing,
                traceStatus: 'incomplete',
                recordingError: {
                    message:
                        error instanceof Error ? error.message : String(error),
                    occurredAt: new Date().toISOString(),
                },
                updatedAt: new Date().toISOString(),
            })
        }),
        recordFailure: mock(async () => {}),
        recordMinimalFailure: mock(async () => {}),
    } as unknown as FakeTraceRecorder

    createdTraceRecorders.push(recorder)
    return recorder
}

function expectTrace(
    recorder: FakeTraceRecorder,
    runId: string,
): AgentRunTracePayload {
    const trace = recorder.traces.get(runId)
    expect(trace).toBeDefined()
    return trace as AgentRunTracePayload
}

function expectLatestTrace(runId: string): AgentRunTracePayload {
    for (const recorder of createdTraceRecorders.slice().reverse()) {
        const trace = recorder.traces.get(runId)
        if (trace) return trace
    }
    throw new Error(`Trace not found for ${runId}`)
}

function createCachePlanFixture(
    overrides: Partial<CachePlanSnapshot> = {},
): CachePlanSnapshot {
    return {
        provider: 'anthropic',
        stableCoreSegmentIds: ['base'],
        cacheableSessionSegmentIds: ['memory'],
        dynamicTailSegmentIds: ['history'],
        effectivePrefixSegmentIds: ['base', 'memory'],
        effectivePrefixEstimatedTokens: 1600,
        breakpoints: [
            { layer: 'stableCore', segmentId: 'base' },
            { layer: 'cacheableSession', segmentId: 'memory' },
        ],
        hashes: {
            toolDefinitionsHash: 'tool-hash',
            systemHash: 'system-hash',
            memoryHash: 'memory-hash',
            dynamicTailHash: 'dynamic-tail-hash',
        },
        eligibility: {
            providerSupportsPromptCache: true,
            prefixAboveThreshold: true,
            cacheExpected: true,
            cacheExpectationReason: 'stable_prefix_ready',
            providerRuleAssumptions: ['anthropic.cacheControl.ephemeral'],
        },
        ...overrides,
    }
}

const mockBuildCachePlan = mock(() => createCachePlanFixture())
const mockBuildProviderCacheRequest = mock(
    (input: {
        systemSegments: Array<{ payload: { text: string } }>
        modelMessages: unknown[]
        providerOptions: Record<string, unknown>
        tools?: Record<string, unknown>
    }) => ({
        system: input.systemSegments
            .map((segment) => segment.payload.text)
            .join('\n\n'),
        messages: input.modelMessages,
        providerOptions: input.providerOptions,
        tools: input.tools,
    }),
)
const mockNormalizeProviderCacheResult = mock(
    (input: {
        cacheDisabledReason?: string
        rolloutGateStatus: 'observe-only' | 'enabled' | 'disabled'
        circuitBreakerState: 'closed' | 'open'
    }) => ({
        cacheObserved: false,
        evidenceSource: 'none' as const,
        cacheDisabledReason: input.cacheDisabledReason,
        rolloutGateStatus: input.rolloutGateStatus,
        circuitBreakerState: input.circuitBreakerState,
    }),
)

mock.module('ai', async () => {
    return {
        convertToModelMessages: mockConvertToModelMessages,
        stepCountIs: mockStepCountIs,
        streamText: mockStreamText,
    }
})

mock.module('../../../../src/core/ai/runtime/cache-plan', () => ({
    buildCachePlan: mockBuildCachePlan,
}))

mock.module('../../../../src/core/ai/runtime/provider-cache', () => ({
    buildProviderCacheRequest: mockBuildProviderCacheRequest,
    normalizeProviderCacheResult: mockNormalizeProviderCacheResult,
}))

async function loadCreateRuntimeModule() {
    return import('../../../../src/core/ai/runtime/create')
}

async function loadCreateAIRuntime() {
    const mod = await loadCreateRuntimeModule()
    return mod.createAIRuntime
}

const mockModel = {} as never
let originalConsoleWarn: typeof console.warn
let originalConsoleError: typeof console.error
let mockConsoleWarn: ReturnType<typeof mock>
let mockConsoleError: ReturnType<typeof mock>

beforeEach(async () => {
    createdTraceRecorders = []
    mockConvertToModelMessages.mockClear()
    mockStepCountIs.mockClear()
    mockStreamText.mockClear()
    mockStreamText.mockImplementation(() => createMockStreamResult())

    mockBuildCachePlan.mockClear()
    mockBuildCachePlan.mockImplementation(() => createCachePlanFixture())

    mockBuildProviderCacheRequest.mockClear()
    mockBuildProviderCacheRequest.mockImplementation(
        (input: {
            systemSegments: Array<{ payload: { text: string } }>
            modelMessages: unknown[]
            providerOptions: Record<string, unknown>
            tools?: Record<string, unknown>
        }) => ({
            system: input.systemSegments
                .map((segment) => segment.payload.text)
                .join('\n\n'),
            messages: input.modelMessages,
            providerOptions: input.providerOptions,
            tools: input.tools,
        }),
    )

    mockNormalizeProviderCacheResult.mockClear()
    mockNormalizeProviderCacheResult.mockImplementation(
        (input: {
            cacheDisabledReason?: string
            rolloutGateStatus: 'observe-only' | 'enabled' | 'disabled'
            circuitBreakerState: 'closed' | 'open'
        }) => ({
            cacheObserved: false,
            evidenceSource: 'none' as const,
            cacheDisabledReason: input.cacheDisabledReason,
            rolloutGateStatus: input.rolloutGateStatus,
            circuitBreakerState: input.circuitBreakerState,
        }),
    )

    originalConsoleWarn = console.warn
    originalConsoleError = console.error
    mockConsoleWarn = mock(() => {})
    mockConsoleError = mock(() => {})
    console.warn = mockConsoleWarn as typeof console.warn
    console.error = mockConsoleError as typeof console.error

    const runtimeModule = (await loadCreateRuntimeModule()) as {
        __resetCacheRolloutStatesForTests?: () => void
    }
    runtimeModule.__resetCacheRolloutStatesForTests?.()
})

afterEach(() => {
    console.warn = originalConsoleWarn
    console.error = originalConsoleError
})

afterAll(() => {
    mock.restore()
})

describe('createAIRuntime', () => {
    test('rejects duplicate plugin names', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const plugins: AIPlugin[] = [{ name: 'dup' }, { name: 'dup' }]
        expect(
            createAIRuntime({
                model: mockModel,
                plugins,
                agentRunStore: createFakeAgentRunStore(),
                traceRecorder: createFakeTraceRecorder(),
            }),
        ).rejects.toThrow('Duplicate plugin name: "dup"')
    })

    test('calls init() on all plugins in order', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const order: string[] = []
        const plugins: AIPlugin[] = [
            {
                name: 'a',
                async init() {
                    order.push('a')
                },
            },
            {
                name: 'b',
                async init() {
                    order.push('b')
                },
            },
        ]
        await createAIRuntime({
            model: mockModel,
            plugins,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
        })
        expect(order).toEqual(['a', 'b'])
    })

    test('propagates init() errors', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const plugins: AIPlugin[] = [
            {
                name: 'bad',
                async init() {
                    throw new Error('init failed')
                },
            },
        ]
        expect(
            createAIRuntime({
                model: mockModel,
                plugins,
                agentRunStore: createFakeAgentRunStore(),
                traceRecorder: createFakeTraceRecorder(),
            }),
        ).rejects.toThrow('init failed')
    })

    test('returns runtime with chat and dispose', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const runtime = await createAIRuntime({
            model: mockModel,
            plugins: [],
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
        })
        expect(typeof runtime.chat).toBe('function')
        expect(typeof runtime.dispose).toBe('function')
    })

    test('chat output records runtime-owned plugin provenance in trace checkpoints', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const traceRecorder = createFakeTraceRecorder()
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder,
            plugins: [
                {
                    name: 'runtime-owner',
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
                                source: { plugin: 'self-reported-source' },
                                priority: 'high',
                                cacheability: 'stable',
                                compactability: 'preserve',
                            },
                        ],
                    }),
                },
            ],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })

        const trace = expectTrace(traceRecorder, output.runId)
        expect(trace.plugins?.contributions).toEqual([
            {
                plugin: 'runtime-owner',
                segmentIds: ['base'],
                toolNames: [],
                paramKeys: [],
                diagnosticCount: 0,
            },
        ])
        expect(trace.prompt?.segments[0]).toMatchObject({
            id: 'base',
            sourcePlugin: 'runtime-owner',
        })
    })

    test('records the successful agent run lifecycle', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const traceRecorder = createFakeTraceRecorder()
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder,
            plugins: [
                {
                    name: 'session',
                    beforeRun(ctx) {
                        ctx.meta.set('sessionId', 'session-1')
                    },
                },
            ],
        })

        const output = await runtime.chat({
            messages: [
                {
                    id: 'u1',
                    role: 'user',
                    parts: [{ type: 'text', text: 'Hi' }],
                },
            ],
            channel: 'web',
            mode: 'conversation',
        })
        await output.consumeStream()
        const trace = expectTrace(traceRecorder, output.runId)

        expect(trace.traceStatus).toBe('complete')
        expect(trace.runOutcome).toBe('succeeded')
        expect(trace.currentPhase).toBe('after_run')
        expect(trace.completedPhases).toContain('after_run')
        expect(agentRunStore.createRunningRun).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: output.runId,
                source: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                inputSummary: expect.stringContaining('Hi'),
            }),
        )
        expect(agentRunStore.attachSession).toHaveBeenCalledWith(
            output.runId,
            'session-1',
        )
        expect(agentRunStore.succeedIfRunning).toHaveBeenCalledWith(
            output.runId,
            {
                messageId: 'assistant-1',
                outputSummary: 'mock text',
                usage: { inputTokens: 10, outputTokens: 5 },
            },
        )
    })

    test('consumeStream attaches run and session metadata to runtime-owned assistant messages', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'cron',
            mode: 'trigger',
            sessionId: 'session-1',
        })
        const consumed = await output.consumeStream()

        expect(consumed.responseMessage.metadata).toMatchObject({
            runId: output.runId,
            sessionId: 'session-1',
        })
    })

    test('continues when trace start fails before streaming begins', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const traceRecorder = createFakeTraceRecorder({ failStart: true })
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder,
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        await output.consumeStream()

        expect(mockStreamText).toHaveBeenCalled()
        expect(traceRecorder.markIncomplete).not.toHaveBeenCalled()
        expect(agentRunStore.recordWarnings).toHaveBeenCalledWith(
            output.runId,
            [
                expect.objectContaining({
                    source: 'trace.recorder',
                    message: 'trace start failed',
                }),
            ],
        )
        expect(agentRunStore.failIfRunning).not.toHaveBeenCalled()
        expect(agentRunStore.succeedIfRunning).toHaveBeenCalled()
    })

    test('pre-stream trace checkpoint failures warn and do not block chat', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const traceRecorder = createFakeTraceRecorder({
            failCheckpointPhase: 'assemble_context',
        })
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder,
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        await output.consumeStream()

        expect(traceRecorder.markIncomplete).toHaveBeenCalledWith(
            output.runId,
            expect.any(Error),
        )
        expect(agentRunStore.recordWarnings).toHaveBeenCalledWith(
            output.runId,
            [
                expect.objectContaining({
                    source: 'trace.recorder',
                    message: 'trace checkpoint failed: assemble_context',
                }),
            ],
        )
        expect(agentRunStore.succeedIfRunning).toHaveBeenCalled()
        expect(expectTrace(traceRecorder, output.runId).traceStatus).toBe(
            'incomplete',
        )
    })

    test('post-stream trace checkpoint failures warn and mark the trace incomplete', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const traceRecorder = createFakeTraceRecorder({
            failCheckpointPhase: 'model_stream',
        })
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder,
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        await output.consumeStream()

        expect(traceRecorder.markIncomplete).toHaveBeenCalledWith(
            output.runId,
            expect.any(Error),
        )
        expect(agentRunStore.recordWarnings).toHaveBeenCalledWith(
            output.runId,
            [
                expect.objectContaining({
                    source: 'trace.recorder',
                    message: 'trace checkpoint failed: model_stream',
                }),
            ],
        )
        expect(agentRunStore.succeedIfRunning).toHaveBeenCalled()
        expect(expectTrace(traceRecorder, output.runId).traceStatus).toBe(
            'incomplete',
        )
    })

    test('records failure when stream consumption fails', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const streamError = new Error('stream broke')
        const agentRunStore = createFakeAgentRunStore()
        mockStreamText.mockImplementationOnce(() =>
            createMockStreamResult({ text: Promise.reject(streamError) }),
        )
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })

        await expect(output.consumeStream()).rejects.toThrow('stream broke')
        expect(agentRunStore.failIfRunning).toHaveBeenCalledWith(
            output.runId,
            expect.objectContaining({ error: expect.any(Error) }),
        )
        expect(agentRunStore.failIfRunning).toHaveBeenCalledTimes(1)
    })

    test('does not execute the model when createRunningRun fails', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const ledgerError = new Error('ledger unavailable')
        const agentRunStore = createFakeAgentRunStore()
        agentRunStore.createRunningRun = mock(() =>
            Promise.reject(ledgerError),
        ) as AgentRunStore['createRunningRun']
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        await expect(
            runtime.chat({
                messages: [],
                channel: 'web',
                mode: 'conversation',
            }),
        ).rejects.toThrow('ledger unavailable')
        expect(mockStreamText).not.toHaveBeenCalled()
        expect(agentRunStore.failIfRunning).not.toHaveBeenCalled()
    })

    test('passes the supplied abortSignal to streamText', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const abortController = new AbortController()
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
            abortSignal: abortController.signal,
        })

        expect(
            (mockStreamText.mock.calls[0][0] as { abortSignal?: AbortSignal })
                .abortSignal,
        ).toBe(abortController.signal)
    })

    test('records stream callback errors as failed agent runs', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        const streamOptions = mockStreamText.mock.calls[0][0] as {
            onError?: (input: { error: unknown }) => void
        }
        const streamError = new Error('provider failed')

        expect(typeof streamOptions.onError).toBe('function')
        streamOptions.onError?.({ error: streamError })

        expect(agentRunStore.failIfRunning).toHaveBeenCalledWith(output.runId, {
            error: streamError,
        })
    })

    test('records aborted streams as failed and does not mark success', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        const streamOptions = mockStreamText.mock.calls[0][0] as {
            onAbort?: () => void
        }

        expect(typeof streamOptions.onAbort).toBe('function')
        streamOptions.onAbort?.()

        await expect(output.consumeStream()).rejects.toThrow('Stream aborted')
        expect(agentRunStore.succeedIfRunning).not.toHaveBeenCalled()
        expect(agentRunStore.failIfRunning).toHaveBeenCalledWith(
            output.runId,
            expect.objectContaining({
                error: expect.any(Error),
                code: 'ABORTED',
            }),
        )
        expect(agentRunStore.failIfRunning).toHaveBeenCalledTimes(1)
    })

    test('does not finalize success when abort signal fires before consumeStream finalizes', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const abortController = new AbortController()
        const ignoredAbortResponseMessage = {
            id: 'assistant-after-abort',
            role: 'assistant',
            parts: [{ type: 'text', text: 'late text' }],
        }

        mockStreamText.mockImplementationOnce(() => ({
            ...createMockStreamResult({ text: 'late text' }),
            toUIMessageStream: (opts?: {
                onFinish?: (payload: {
                    responseMessage: typeof ignoredAbortResponseMessage
                }) => void
            }) =>
                new ReadableStream({
                    start(controller) {
                        opts?.onFinish?.({
                            responseMessage: ignoredAbortResponseMessage,
                        })
                        abortController.abort()
                        controller.close()
                    },
                }),
        }))

        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'cron',
            mode: 'trigger',
            abortSignal: abortController.signal,
        })

        await expect(output.consumeStream()).rejects.toThrow('Stream aborted')
        expect(agentRunStore.succeedIfRunning).not.toHaveBeenCalled()
        expect(agentRunStore.failIfRunning).toHaveBeenCalledWith(
            output.runId,
            expect.objectContaining({
                error: expect.any(Error),
                code: 'ABORTED',
            }),
        )
    })

    test('does not finalize success when abort signal fires while finalize resolves stream data', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const abortController = new AbortController()
        let resolveText: (text: string) => void = () => {}
        const delayedText = new Promise<string>((resolve) => {
            resolveText = resolve
        })

        mockStreamText.mockImplementationOnce(() =>
            createMockStreamResult({ text: delayedText }),
        )

        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'cron',
            mode: 'trigger',
            abortSignal: abortController.signal,
        })
        const consumePromise = output.consumeStream()

        await new Promise((resolve) => setTimeout(resolve, 0))
        abortController.abort()
        resolveText('late text')

        await expect(consumePromise).rejects.toThrow('Stream aborted')
        expect(agentRunStore.succeedIfRunning).not.toHaveBeenCalled()
        expect(agentRunStore.failIfRunning).toHaveBeenCalledWith(
            output.runId,
            expect.objectContaining({
                error: expect.any(Error),
                code: 'ABORTED',
            }),
        )
    })

    test('records afterRun warnings after success', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder: createFakeTraceRecorder(),
            plugins: [
                {
                    name: 'bad',
                    afterRun() {
                        throw new Error('afterRun failed')
                    },
                },
            ],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        await output.consumeStream()

        expect(agentRunStore.succeedIfRunning).toHaveBeenCalled()
        expect(agentRunStore.recordWarnings).toHaveBeenCalledWith(
            output.runId,
            [{ source: 'bad.afterRun', message: 'afterRun failed' }],
        )
    })

    test('records failure with resolved session id when beforeRun fails', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const agentRunStore = createFakeAgentRunStore()
        const runtime = await createAIRuntime({
            model: mockModel,
            agentRunStore,
            traceRecorder: createFakeTraceRecorder(),
            plugins: [
                {
                    name: 'session',
                    beforeRun(ctx) {
                        ctx.meta.set('sessionId', 'session-before-fail')
                        throw new Error('append failed')
                    },
                },
            ],
        })

        await expect(
            runtime.chat({
                messages: [],
                channel: 'web',
                mode: 'conversation',
            }),
        ).rejects.toThrow('append failed')
        expect(agentRunStore.failIfRunning).toHaveBeenCalledWith(
            expect.any(String),
            {
                error: expect.any(Error),
                sessionId: 'session-before-fail',
            },
        )
    })

    test('chat trace stores normalized segments and the resolved max output cap', async () => {
        mockStreamText.mockClear()

        const createAIRuntime = await loadCreateAIRuntime()
        const traceRecorder = createFakeTraceRecorder()
        const runtime = await createAIRuntime({
            model: { modelId: 'gpt-4.1' } as never,
            defaults: { maxTokens: 2048 },
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder,
            plugins: [
                {
                    name: 'low',
                    contribute: () => ({
                        segments: [
                            {
                                id: 'low',
                                target: 'system',
                                kind: 'system.instructions',
                                payload: {
                                    format: 'text',
                                    text: 'low priority',
                                },
                                source: { plugin: 'low' },
                                priority: 'low',
                                cacheability: 'session',
                                compactability: 'preserve',
                            },
                        ],
                    }),
                },
                {
                    name: 'high',
                    contribute: () => ({
                        segments: [
                            {
                                id: 'high',
                                target: 'system',
                                kind: 'system.base',
                                payload: {
                                    format: 'text',
                                    text: 'high priority',
                                },
                                source: { plugin: 'high' },
                                priority: 'high',
                                cacheability: 'stable',
                                compactability: 'preserve',
                            },
                        ],
                    }),
                },
            ],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })

        const trace = expectTrace(traceRecorder, output.runId)
        const systemSegments =
            trace.prompt?.segments.filter(
                (segment) => segment.target === 'system',
            ) ?? []

        expect(systemSegments.map((segment) => segment.id)).toEqual([
            'high',
            'low',
        ])
        expect(systemSegments[0]).toMatchObject({ finalOrder: 0 })
        expect(systemSegments[1]).toMatchObject({ finalOrder: 1 })
        expect(trace.prompt?.finalInput.params.resolved.maxTokens).toBe(2048)
        expect(mockStreamText).toHaveBeenCalledTimes(1)
        expect(
            (mockStreamText.mock.calls[0][0] as Record<string, unknown>)
                .maxOutputTokens,
        ).toBe(2048)
    })

    test('chat does not infer a max output cap from modelId', async () => {
        mockStreamText.mockClear()

        const createAIRuntime = await loadCreateAIRuntime()
        const traceRecorder = createFakeTraceRecorder()
        const runtime = await createAIRuntime({
            model: { modelId: 'gpt-4.1' } as never,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder,
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })

        const trace = expectTrace(traceRecorder, output.runId)
        const streamArgs = mockStreamText.mock.calls[0][0] as Record<
            string,
            unknown
        >

        expect(
            trace.prompt?.finalInput.params.resolved.maxTokens,
        ).toBeUndefined()
        expect('maxOutputTokens' in streamArgs).toBe(false)
    })

    test('chat builds and attaches cachePlan to the trace', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const cachePlan = createCachePlanFixture()
        mockBuildCachePlan.mockImplementationOnce(() => cachePlan)

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [
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
                        ],
                    }),
                },
            ],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })

        expect(mockBuildCachePlan).toHaveBeenCalledTimes(1)
        expect(mockBuildCachePlan.mock.calls[0]?.[0]).toMatchObject({
            provider: 'anthropic',
            modelId: 'claude-3-7-sonnet',
        })
        expect(expectLatestTrace(output.runId).cache?.plan).toMatchObject({
            provider: cachePlan.provider,
            modelId: cachePlan.modelId,
            stableCoreSegmentIds: cachePlan.stableCoreSegmentIds,
            cacheableSessionSegmentIds: cachePlan.cacheableSessionSegmentIds,
            dynamicTailSegmentIds: cachePlan.dynamicTailSegmentIds,
            effectivePrefixSegmentIds: cachePlan.effectivePrefixSegmentIds,
            effectivePrefixEstimatedTokens:
                cachePlan.effectivePrefixEstimatedTokens,
            hashes: cachePlan.hashes,
            eligibility: cachePlan.eligibility,
        })
    })

    test('chat uses provider cache helper output for eligible Anthropic requests', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const cachePlan = createCachePlanFixture()
        const rewrittenMessages = [
            {
                role: 'system',
                content: 'cached stable prompt',
                providerOptions: {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                },
            },
            {
                role: 'user',
                content: 'hello',
            },
        ]
        const rewrittenTools = {
            searchStock: {
                description: 'Search stock by symbol',
                inputSchema: {
                    type: 'object',
                    properties: {
                        symbol: { type: 'string' },
                    },
                    required: ['symbol'],
                },
                execute: async () => undefined,
                providerOptions: {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                },
            },
        }

        mockBuildCachePlan.mockImplementationOnce(() => cachePlan)
        mockBuildProviderCacheRequest.mockImplementationOnce(() => ({
            system: undefined,
            messages: rewrittenMessages,
            providerOptions: {
                anthropic: {
                    thinking: { type: 'enabled', budgetTokens: 256 },
                },
            },
            tools: rewrittenTools,
        }))

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
            defaults: { thinkingBudget: 256 },
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [
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
                        ],
                    }),
                },
            ],
        })

        const output = await runtime.chat({
            messages: [
                {
                    id: 'u1',
                    role: 'user',
                    parts: [{ type: 'text', text: 'hello' }],
                },
            ],
            channel: 'web',
            mode: 'conversation',
        })
        const trace = expectLatestTrace(output.runId)
        const providerRequest = trace.cache?.providerRequest
        const streamArgs = mockStreamText.mock.calls[0]?.[0] as Record<
            string,
            unknown
        >

        expect(mockBuildProviderCacheRequest).toHaveBeenCalledTimes(1)
        expect(mockBuildProviderCacheRequest.mock.calls[0]?.[0]).toMatchObject({
            provider: 'anthropic',
            cachePlan,
        })
        expect(mockConvertToModelMessages).toHaveBeenCalledWith([
            {
                id: 'u1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            },
        ])
        expect(streamArgs).toMatchObject({
            system: undefined,
            messages: rewrittenMessages,
            providerOptions: {
                anthropic: {
                    thinking: { type: 'enabled', budgetTokens: 256 },
                },
            },
            tools: rewrittenTools,
        })
        expect(streamArgs.system).toBeUndefined()
        expect(trace.prompt?.finalInput.systemText).toBe('base prompt')
        expect(trace.prompt?.finalInput.modelMessages).toEqual([
            {
                id: 'u1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            },
        ])
        expect(trace.prompt?.finalInput.modelMessages).not.toEqual(
            streamArgs.messages,
        )
        expect(providerRequest?.providerOptions.value).toEqual({
            anthropic: {
                thinking: {
                    type: 'enabled',
                    budgetTokens: 256,
                },
            },
        })
        expect(trace.result?.provider).toBeUndefined()
        expect(providerRequest).toMatchObject({
            preparedCacheRequest: true,
            usedCacheRequest: true,
            cachedToolNames: ['searchStock'],
            cachedToolCount: 1,
            cacheControlBreakpoints: {
                count: 2,
                sources: {
                    providerMessages: 1,
                    tools: 1,
                    cachePlan: 2,
                },
            },
        })
        expect(providerRequest?.providerMessages).toEqual([
            {
                index: 0,
                role: 'system',
                contentType: 'string',
                contentLength: 'cached stable prompt'.length,
                hasAnthropicCacheControl: true,
                anthropicCacheControl: { type: 'ephemeral' },
            },
            {
                index: 1,
                role: 'user',
                contentType: 'string',
                contentLength: 'hello'.length,
                hasAnthropicCacheControl: false,
            },
        ])
        expect(providerRequest?.providerMessages[0]).not.toHaveProperty(
            'content',
        )
    })

    test('consumeStream normalizes cache usage into trace cache result', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const cachePlan = createCachePlanFixture()
        const totalUsage = {
            inputTokens: 1600,
            outputTokens: 80,
            inputTokenDetails: {
                cacheReadTokens: 1200,
                cacheWriteTokens: 300,
                noCacheTokens: 100,
            },
        }
        const providerMetadata = {
            anthropic: {
                usage: {
                    cache_creation_input_tokens: 300,
                    cache_read_input_tokens: 1200,
                },
            },
        }
        const normalizedCacheResult = {
            cacheObserved: true,
            evidenceSource: 'both' as const,
            cacheReadTokens: 1200,
            cacheWriteTokens: 300,
            uncachedInputTokens: 100,
            cachedTokenRatio: 0.75,
            rolloutGateStatus: 'enabled' as const,
            circuitBreakerState: 'closed' as const,
        }

        mockBuildCachePlan.mockImplementationOnce(() => cachePlan)
        mockStreamText.mockImplementationOnce(() =>
            createMockStreamResult({ totalUsage, providerMetadata }),
        )
        mockNormalizeProviderCacheResult.mockImplementationOnce(
            () => normalizedCacheResult,
        )

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        await output.consumeStream()
        const trace = expectLatestTrace(output.runId)

        expect(mockNormalizeProviderCacheResult).toHaveBeenCalledTimes(1)
        expect(
            mockNormalizeProviderCacheResult.mock.calls[0]?.[0],
        ).toMatchObject({
            cachePlan,
            totalUsage,
            providerMetadata,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
            cacheDisabledReason: undefined,
        })
        expect(trace.cache?.result).toEqual(normalizedCacheResult)
    })

    test('chat falls back cleanly when cache planning throws', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const normalizedCacheResult = {
            cacheObserved: false,
            evidenceSource: 'none' as const,
            cacheDisabledReason: 'cache_plan_failed',
            rolloutGateStatus: 'observe-only' as const,
            circuitBreakerState: 'closed' as const,
        }

        mockBuildCachePlan.mockImplementationOnce(() => {
            throw new Error('cache plan blew up')
        })
        mockNormalizeProviderCacheResult.mockImplementationOnce(
            (input: {
                cacheDisabledReason?: string
                rolloutGateStatus: 'observe-only' | 'enabled' | 'disabled'
                circuitBreakerState: 'closed' | 'open'
            }) => ({
                ...normalizedCacheResult,
                cacheDisabledReason: input.cacheDisabledReason,
                rolloutGateStatus: input.rolloutGateStatus,
                circuitBreakerState: input.circuitBreakerState,
            }),
        )

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [
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
                        ],
                    }),
                },
            ],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        await output.consumeStream()
        const trace = expectLatestTrace(output.runId)

        expect(mockBuildProviderCacheRequest).not.toHaveBeenCalled()
        expect(trace.cache?.plan).toBeUndefined()
        expect(trace.cache?.result).toEqual(normalizedCacheResult)
        expect(trace.cache?.result?.cacheDisabledReason).toBe(
            'cache_plan_failed',
        )
        expect(trace.cache?.result?.rolloutGateStatus).toBe('observe-only')
        expect(mockStreamText.mock.calls[0]?.[0]).toMatchObject({
            system: 'base prompt',
        })
        expect(mockConsoleWarn).toHaveBeenCalledTimes(1)
        expect(String(mockConsoleWarn.mock.calls[0]?.[0] ?? '')).toContain(
            'cache planning',
        )
    })

    test('chat reports observe-only when cache shaping falls back after an adapter failure', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const cachePlan = createCachePlanFixture()

        mockBuildCachePlan.mockImplementationOnce(() => cachePlan)
        mockBuildProviderCacheRequest.mockImplementationOnce(() => {
            throw new Error('adapter blew up')
        })

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [
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
                        ],
                    }),
                },
            ],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        const consumed = await output.consumeStream()

        expect(consumed.text).toBe('mock text')
        const trace = expectLatestTrace(output.runId)
        expect(trace.cache?.plan).toMatchObject({
            provider: cachePlan.provider,
            effectivePrefixSegmentIds: cachePlan.effectivePrefixSegmentIds,
        })
        expect(trace.cache?.result).toMatchObject({
            cacheObserved: false,
            cacheDisabledReason: 'cache_adapter_failed',
            rolloutGateStatus: 'observe-only',
            circuitBreakerState: 'closed',
        })
        expect(mockBuildProviderCacheRequest).toHaveBeenCalledTimes(1)
        expect(mockStreamText).toHaveBeenCalledTimes(1)
        expect(mockStreamText.mock.calls[0]?.[0]).toMatchObject({
            system: 'base prompt',
        })
    })

    test('below-threshold cache plans stay observe-only and do not reset rollout failures', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const belowThresholdPlan = createCachePlanFixture({
            effectivePrefixEstimatedTokens: 900,
            eligibility: {
                providerSupportsPromptCache: true,
                prefixAboveThreshold: false,
                cacheExpected: false,
                cacheExpectationReason: 'below_cache_threshold',
                providerRuleAssumptions: ['anthropic.cacheControl.ephemeral'],
            },
        })

        mockBuildCachePlan.mockImplementationOnce(() => {
            throw new Error('cache plan failed 1')
        })
        mockBuildCachePlan.mockImplementationOnce(() => {
            throw new Error('cache plan failed 2')
        })
        mockBuildCachePlan.mockImplementationOnce(() => belowThresholdPlan)
        mockBuildCachePlan.mockImplementationOnce(() => {
            throw new Error('cache plan failed 3')
        })

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [
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
                        ],
                    }),
                },
            ],
        })

        await (
            await runtime.chat({
                messages: [],
                channel: 'web',
                mode: 'conversation',
            })
        ).consumeStream()
        await (
            await runtime.chat({
                messages: [],
                channel: 'web',
                mode: 'conversation',
            })
        ).consumeStream()

        const belowThresholdOutput = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        await belowThresholdOutput.consumeStream()
        const belowThresholdTrace = expectLatestTrace(
            belowThresholdOutput.runId,
        )

        expect(belowThresholdTrace.cache?.plan).toMatchObject({
            provider: belowThresholdPlan.provider,
            effectivePrefixEstimatedTokens:
                belowThresholdPlan.effectivePrefixEstimatedTokens,
            eligibility: belowThresholdPlan.eligibility,
        })
        expect(belowThresholdTrace.cache?.result).toMatchObject({
            cacheObserved: false,
            cacheDisabledReason: undefined,
            rolloutGateStatus: 'observe-only',
            circuitBreakerState: 'closed',
        })
        expect(mockBuildProviderCacheRequest).not.toHaveBeenCalled()
        expect(mockStreamText).toHaveBeenCalledTimes(3)
        expect(mockStreamText.mock.calls[2]?.[0]).toMatchObject({
            system: 'base prompt',
        })

        const finalOutput = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        await finalOutput.consumeStream()
        const finalTrace = expectLatestTrace(finalOutput.runId)

        expect(finalTrace.cache?.result).toMatchObject({
            cacheObserved: false,
            cacheDisabledReason: 'circuit_breaker_open',
            rolloutGateStatus: 'disabled',
            circuitBreakerState: 'open',
        })
        expect(mockBuildCachePlan).toHaveBeenCalledTimes(4)
        expect(mockStreamText).toHaveBeenCalledTimes(4)
    })

    test('chat retries once without cache when the cache-shaped request is rejected', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const cachePlan = createCachePlanFixture()
        const rewrittenMessages = [
            {
                role: 'system',
                content: 'cached stable prompt',
                providerOptions: {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                },
            },
            {
                role: 'user',
                content: 'hello',
            },
        ]

        mockBuildCachePlan.mockImplementationOnce(() => cachePlan)
        mockBuildProviderCacheRequest.mockImplementationOnce(() => ({
            system: undefined,
            messages: rewrittenMessages,
            providerOptions: {
                anthropic: {
                    thinking: { type: 'enabled', budgetTokens: 256 },
                },
            },
        }))
        mockStreamText.mockImplementationOnce(() => {
            throw new Error('provider rejected cache request')
        })
        mockStreamText.mockImplementationOnce(() =>
            createMockStreamResult({ text: 'fallback stream text' }),
        )

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
            defaults: { thinkingBudget: 256 },
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [
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
                        ],
                    }),
                },
            ],
        })

        const output = await runtime.chat({
            messages: [
                {
                    id: 'u1',
                    role: 'user',
                    parts: [{ type: 'text', text: 'hello' }],
                },
            ],
            channel: 'web',
            mode: 'conversation',
        })
        const consumed = await output.consumeStream()
        const trace = expectLatestTrace(output.runId)

        expect(consumed.text).toBe('fallback stream text')
        expect(trace.cache?.result).toMatchObject({
            cacheObserved: false,
            cacheDisabledReason: 'cache_request_failed',
            rolloutGateStatus: 'observe-only',
            circuitBreakerState: 'closed',
        })
        expect(mockBuildProviderCacheRequest).toHaveBeenCalledTimes(1)
        expect(mockStreamText).toHaveBeenCalledTimes(2)
        expect(mockStreamText.mock.calls[0]?.[0]).toMatchObject({
            system: undefined,
            messages: rewrittenMessages,
        })
        expect(mockStreamText.mock.calls[1]?.[0]).toMatchObject({
            system: 'base prompt',
            messages: [
                {
                    id: 'u1',
                    role: 'user',
                    parts: [{ type: 'text', text: 'hello' }],
                },
            ],
            providerOptions: {
                anthropic: {
                    thinking: { type: 'enabled', budgetTokens: 256 },
                },
            },
        })
        expect(trace.cache?.providerRequest).toMatchObject({
            preparedCacheRequest: true,
            usedCacheRequest: false,
            cacheControlBreakpoints: {
                count: 0,
                sources: {
                    providerMessages: 0,
                    tools: 0,
                    cachePlan: 2,
                },
            },
        })
    })

    test('opens the cache rollout guard after repeated planner failures', async () => {
        const createAIRuntime = await loadCreateAIRuntime()

        mockBuildCachePlan.mockImplementation(() => {
            throw new Error('cache plan failed')
        })

        const runtime = await createAIRuntime({
            model: {
                provider: 'anthropic',
                modelId: 'claude-sonnet-4-6',
            } as never,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        await runtime.chat({
            messages: [],
            channel: 'discord',
            mode: 'conversation',
        })
        await runtime.chat({
            messages: [],
            channel: 'discord',
            mode: 'conversation',
        })
        await runtime.chat({
            messages: [],
            channel: 'discord',
            mode: 'conversation',
        })
        const output = await runtime.chat({
            messages: [],
            channel: 'discord',
            mode: 'conversation',
        })
        await output.consumeStream()
        const trace = expectLatestTrace(output.runId)

        expect(trace.cache?.result).toMatchObject({
            cacheObserved: false,
            cacheDisabledReason: 'circuit_breaker_open',
            rolloutGateStatus: 'disabled',
            circuitBreakerState: 'open',
        })
        expect(mockBuildCachePlan).toHaveBeenCalledTimes(3)
        expect(mockBuildProviderCacheRequest).not.toHaveBeenCalled()
        expect(mockStreamText).toHaveBeenCalledTimes(4)
    })

    test('keeps chat alive and opens the rollout guard after repeated cache adapter failures', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const cachePlan = createCachePlanFixture()

        mockBuildCachePlan.mockImplementation(() => cachePlan)
        mockBuildProviderCacheRequest.mockImplementation(() => {
            throw new Error('adapter blew up')
        })

        const runtime = await createAIRuntime({
            model: {
                provider: 'anthropic',
                modelId: 'claude-sonnet-4-6',
            } as never,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [
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
                        ],
                    }),
                },
            ],
        })

        await runtime.chat({
            messages: [],
            channel: 'cron',
            mode: 'trigger',
            agentType: 'auto-trading-agent',
        })
        await runtime.chat({
            messages: [],
            channel: 'cron',
            mode: 'trigger',
            agentType: 'auto-trading-agent',
        })
        await runtime.chat({
            messages: [],
            channel: 'cron',
            mode: 'trigger',
            agentType: 'auto-trading-agent',
        })
        const output = await runtime.chat({
            messages: [],
            channel: 'cron',
            mode: 'trigger',
            agentType: 'auto-trading-agent',
        })
        const consumed = await output.consumeStream()
        const trace = expectLatestTrace(output.runId)

        expect(consumed.text).toBe('mock text')
        expect(trace.cache?.plan).toBeUndefined()
        expect(trace.cache?.result).toMatchObject({
            cacheObserved: false,
            cacheDisabledReason: 'circuit_breaker_open',
            rolloutGateStatus: 'disabled',
            circuitBreakerState: 'open',
        })
        expect(mockBuildCachePlan).toHaveBeenCalledTimes(3)
        expect(mockBuildProviderCacheRequest).toHaveBeenCalledTimes(3)
        expect(mockStreamText).toHaveBeenCalledTimes(4)
    })

    test('consumeStream falls back when cache result normalization throws', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const cachePlan = createCachePlanFixture()

        mockBuildCachePlan.mockImplementationOnce(() => cachePlan)
        mockNormalizeProviderCacheResult.mockImplementationOnce(() => {
            throw new Error('normalize blew up')
        })

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        const consumed = await output.consumeStream()
        const trace = expectLatestTrace(output.runId)

        expect(consumed.text).toBe('mock text')
        expect(trace.cache?.result).toEqual({
            cacheObserved: false,
            evidenceSource: 'none',
            cacheReadObserved: false,
            cacheWriteObserved: false,
            cacheReadEvidenceSource: 'none',
            cacheWriteEvidenceSource: 'none',
            cacheDisabledReason: 'cache_result_normalization_failed',
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })
        expect(mockConsoleError).toHaveBeenCalledTimes(1)
        expect(String(mockConsoleError.mock.calls[0]?.[0] ?? '')).toContain(
            'cache normalization',
        )
    })

    test('dispose() calls destroy() on all plugins', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const destroyed: string[] = []
        const plugins: AIPlugin[] = [
            {
                name: 'a',
                async destroy() {
                    destroyed.push('a')
                },
            },
            {
                name: 'b',
                async destroy() {
                    destroyed.push('b')
                },
            },
        ]
        const runtime = await createAIRuntime({
            model: mockModel,
            plugins,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
        })
        await runtime.dispose()
        expect(destroyed).toEqual(['a', 'b'])
    })

    test('dispose() logs errors but does not throw', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const plugins: AIPlugin[] = [
            {
                name: 'bad',
                async destroy() {
                    throw new Error('destroy fail')
                },
            },
        ]
        const runtime = await createAIRuntime({
            model: mockModel,
            plugins,
            agentRunStore: createFakeAgentRunStore(),
            traceRecorder: createFakeTraceRecorder(),
        })
        // Should not throw
        await runtime.dispose()
    })
})
