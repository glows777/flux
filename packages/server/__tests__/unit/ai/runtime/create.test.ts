import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { AIPlugin, CachePlanSnapshot } from '../../../../src/core/ai/runtime/types'

const mockConvertToModelMessages = mock(async (messages: unknown[]) => messages)
const mockStepCountIs = mock((_count: number) => () => false)

type StreamResultOverrides = {
    text?: string
    usage?: { inputTokens?: number; outputTokens?: number }
    totalUsage?: Record<string, unknown>
    providerMetadata?: Record<string, unknown>
    steps?: unknown[]
}

function createMockStreamResult(overrides: StreamResultOverrides = {}) {
    const responseMessage = {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: overrides.text ?? 'mock text' }],
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
            onFinish?: (payload: { responseMessage: typeof responseMessage }) => void
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
            stableCoreHash: 'stable-core-hash',
            effectivePrefixHash: 'effective-prefix-hash',
            dynamicTailHash: 'dynamic-tail-hash',
        },
        eligibility: {
            providerSupportsPromptCache: true,
            prefixAboveThreshold: true,
            cacheExpected: true,
            cacheExpectationReason: 'stable_prefix_ready',
            providerRuleAssumptions: ['anthropic.cacheControl.ephemeral'],
        },
        providerChangeFlags: {},
        candidateInvalidationReasons: [],
        ...overrides,
    }
}

const mockBuildCachePlan = mock(() => createCachePlanFixture())
const mockBuildProviderCacheRequest = mock(
    (input: {
        systemSegments: Array<{ payload: { text: string } }>
        modelMessages: unknown[]
        providerOptions: Record<string, unknown>
    }) => ({
        system: input.systemSegments.map((segment) => segment.payload.text).join('\n\n'),
        messages: input.modelMessages,
        providerOptions: input.providerOptions,
    }),
)
const mockNormalizeProviderCacheResult = mock(
    (input: {
        cacheDisabledReason?: string
        rolloutGateStatus: 'observe-only' | 'enabled' | 'disabled'
        circuitBreakerState: 'closed' | 'open'
    }) => ({
        cacheObserved: false,
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

async function loadCreateAIRuntime() {
    const mod = await import('../../../../src/core/ai/runtime/create')
    return mod.createAIRuntime
}

const mockModel = {} as never

beforeEach(() => {
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
        }) => ({
            system: input.systemSegments
                .map((segment) => segment.payload.text)
                .join('\n\n'),
            messages: input.modelMessages,
            providerOptions: input.providerOptions,
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
            cacheDisabledReason: input.cacheDisabledReason,
            rolloutGateStatus: input.rolloutGateStatus,
            circuitBreakerState: input.circuitBreakerState,
        }),
    )
})

describe('createAIRuntime', () => {
    test('rejects duplicate plugin names', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const plugins: AIPlugin[] = [{ name: 'dup' }, { name: 'dup' }]
        expect(createAIRuntime({ model: mockModel, plugins })).rejects.toThrow(
            'Duplicate plugin name: "dup"',
        )
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
        await createAIRuntime({ model: mockModel, plugins })
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
        expect(createAIRuntime({ model: mockModel, plugins })).rejects.toThrow(
            'init failed',
        )
    })

    test('returns runtime with chat and dispose', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const runtime = await createAIRuntime({ model: mockModel, plugins: [] })
        expect(typeof runtime.chat).toBe('function')
        expect(typeof runtime.dispose).toBe('function')
    })

    test('chat output exposes a context manifest', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const runtime = await createAIRuntime({
            model: mockModel,
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

        expect(output.getContextManifest().pluginOutputs).toHaveLength(1)
    })

    test('chat manifest stores normalized segments and the resolved max output cap', async () => {
        mockStreamText.mockClear()

        const createAIRuntime = await loadCreateAIRuntime()
        const runtime = await createAIRuntime({
            model: { modelId: 'gpt-4.1' } as never,
            defaults: { maxTokens: 2048 },
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

        const manifest = output.getContextManifest()

        expect(
            manifest.assembledContext.systemSegments.map(
                (segment) => segment.id,
            ),
        ).toEqual(['high', 'low'])
        expect(manifest.assembledContext.systemSegments[0].finalOrder).toBe(0)
        expect(manifest.assembledContext.systemSegments[1].finalOrder).toBe(1)
        expect(manifest.modelRequest.maxOutputTokens).toBe(2048)
        expect(mockStreamText).toHaveBeenCalledTimes(1)
        expect(
            (mockStreamText.mock.calls[0][0] as Record<string, unknown>)
                .maxOutputTokens,
        ).toBe(2048)
    })

    test('chat does not infer a max output cap from modelId', async () => {
        mockStreamText.mockClear()

        const createAIRuntime = await loadCreateAIRuntime()
        const runtime = await createAIRuntime({
            model: { modelId: 'gpt-4.1' } as never,
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })

        const manifest = output.getContextManifest()
        const streamArgs = mockStreamText.mock.calls[0][0] as Record<
            string,
            unknown
        >

        expect(manifest.modelRequest.maxOutputTokens).toBeUndefined()
        expect('maxOutputTokens' in streamArgs).toBe(false)
    })

    test('chat builds and attaches cachePlan to the manifest', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const cachePlan = createCachePlanFixture()
        mockBuildCachePlan.mockImplementationOnce(() => cachePlan)

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
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
        expect(mockBuildCachePlan.mock.calls[0]![0]).toMatchObject({
            provider: 'anthropic',
            modelId: 'claude-3-7-sonnet',
        })
        expect(output.getContextManifest().cachePlan).toEqual(cachePlan)
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

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
            defaults: { thinkingBudget: 256 },
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
            messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
            channel: 'web',
            mode: 'conversation',
        })

        expect(mockBuildProviderCacheRequest).toHaveBeenCalledTimes(1)
        expect(mockBuildProviderCacheRequest.mock.calls[0]![0]).toMatchObject({
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
        expect(mockStreamText.mock.calls[0]![0]).toMatchObject({
            system: undefined,
            messages: rewrittenMessages,
            providerOptions: {
                anthropic: {
                    thinking: { type: 'enabled', budgetTokens: 256 },
                },
            },
        })
    })

    test('consumeStream normalizes cache usage into manifest.result.cacheResult', async () => {
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
        mockNormalizeProviderCacheResult.mockImplementationOnce(() => normalizedCacheResult)

        const runtime = await createAIRuntime({
            model: { modelId: 'claude-3-7-sonnet' } as never,
            plugins: [],
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'web',
            mode: 'conversation',
        })
        const consumed = await output.consumeStream()

        expect(mockNormalizeProviderCacheResult).toHaveBeenCalledTimes(1)
        expect(mockNormalizeProviderCacheResult.mock.calls[0]![0]).toMatchObject({
            cachePlan,
            totalUsage,
            providerMetadata,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
            cacheDisabledReason: undefined,
        })
        expect(consumed.contextManifest.result?.cacheResult).toEqual(normalizedCacheResult)
    })

    test('chat falls back cleanly when cache planning throws', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const normalizedCacheResult = {
            cacheObserved: false,
            cacheDisabledReason: 'cache_plan_failed',
            rolloutGateStatus: 'enabled' as const,
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
        const manifest = consumed.contextManifest

        expect(mockBuildProviderCacheRequest).not.toHaveBeenCalled()
        expect(manifest.cachePlan).toBeUndefined()
        expect(manifest.result?.cacheResult).toEqual(normalizedCacheResult)
        expect(manifest.result?.cacheResult?.cacheDisabledReason).toBe(
            'cache_plan_failed',
        )
        expect(mockStreamText.mock.calls[0]![0]).toMatchObject({
            system: 'base prompt',
        })
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
        const runtime = await createAIRuntime({ model: mockModel, plugins })
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
        const runtime = await createAIRuntime({ model: mockModel, plugins })
        // Should not throw
        await runtime.dispose()
    })
})
