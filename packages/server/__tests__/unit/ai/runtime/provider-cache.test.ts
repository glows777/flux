import { describe, expect, test } from 'bun:test'
import type { ModelMessage } from 'ai'
import type {
    CachePlanSnapshot,
    SystemContextSegmentSnapshot,
} from '../../../../src/core/ai/runtime/types'

async function loadProviderCacheModule() {
    return import(
        '../../../../src/core/ai/runtime/provider-cache.ts?provider-cache-test'
    )
}

const cachePlan: CachePlanSnapshot = {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4',
    minCacheablePrefixTokens: 1024,
    stableCoreSegmentIds: ['global-base', 'global-instructions'],
    cacheableSessionSegmentIds: ['memory-context'],
    dynamicTailSegmentIds: ['session-history'],
    effectivePrefixSegmentIds: [
        'global-base',
        'global-instructions',
        'memory-context',
    ],
    effectivePrefixEstimatedTokens: 1600,
    breakpoints: [
        { layer: 'stableCore', segmentId: 'global-instructions' },
        { layer: 'cacheableSession', segmentId: 'memory-context' },
    ],
    hashes: {
        toolDefinitionsHash: 'tool-hash',
        systemHash: 'system-hash',
        memoryHash: 'memory-hash',
        dynamicTailHash: 'tail-hash',
    },
    eligibility: {
        providerSupportsPromptCache: true,
        prefixAboveThreshold: true,
        minCacheablePrefixTokens: 1024,
        cacheExpected: true,
        cacheExpectationReason: 'stable_prefix_ready',
        providerRuleAssumptions: [
            'anthropic.cacheControl.ephemeral',
            'anthropic.minPrefix>=1024',
        ],
    },
}

const systemSegments: SystemContextSegmentSnapshot[] = [
    {
        id: 'global-base',
        target: 'system',
        kind: 'system.base',
        payload: { format: 'text', text: 'base prompt' },
        source: { plugin: 'prompt' },
        priority: 'required',
        cacheability: 'stable',
        compactability: 'preserve',
        included: true,
        finalOrder: 0,
        estimatedTokens: 500,
    },
    {
        id: 'global-instructions',
        target: 'system',
        kind: 'system.instructions',
        payload: { format: 'text', text: 'tool instructions' },
        source: { plugin: 'prompt' },
        priority: 'high',
        cacheability: 'stable',
        compactability: 'preserve',
        included: true,
        finalOrder: 1,
        estimatedTokens: 500,
    },
    {
        id: 'memory-context',
        target: 'system',
        kind: 'memory.long_lived',
        payload: { format: 'text', text: 'prefers ETFs' },
        source: { plugin: 'prompt' },
        priority: 'high',
        cacheability: 'session',
        compactability: 'summarize',
        included: true,
        finalOrder: 2,
        estimatedTokens: 220,
    },
    {
        id: 'heartbeat-live-context',
        target: 'system',
        kind: 'live.runtime',
        payload: { format: 'text', text: 'market is open for 3 more hours' },
        source: { plugin: 'heartbeat' },
        priority: 'high',
        cacheability: 'volatile',
        compactability: 'trim',
        included: true,
        finalOrder: 3,
        estimatedTokens: 80,
    },
]

const tools = {
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
    },
    getQuote: {
        description: 'Get quote',
        inputSchema: {
            type: 'object',
            properties: {
                symbol: { type: 'string' },
            },
            required: ['symbol'],
        },
        execute: async () => undefined,
    },
}

describe('buildProviderCacheRequest', () => {
    test('rewrites Anthropic system layers into separate cached system messages', async () => {
        const { buildProviderCacheRequest } = await loadProviderCacheModule()
        const request = buildProviderCacheRequest({
            provider: 'anthropic',
            cachePlan,
            systemSegments,
            modelMessages: [
                {
                    role: 'user',
                    content: 'hello',
                },
            ],
            providerOptions: {
                anthropic: {
                    thinking: { type: 'enabled', budgetTokens: 2048 },
                },
            },
            tools,
        })

        expect(request.system).toBeUndefined()
        expect(request.messages).toEqual([
            {
                role: 'system',
                content: 'base prompt\n\ntool instructions',
                providerOptions: {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                },
            },
            {
                role: 'system',
                content: 'prefers ETFs',
                providerOptions: {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                },
            },
            {
                role: 'system',
                content: 'market is open for 3 more hours',
            },
            {
                role: 'user',
                content: 'hello',
            },
        ])
        expect(request.providerOptions).toEqual({
            anthropic: {
                thinking: { type: 'enabled', budgetTokens: 2048 },
            },
        })
        expect(request.tools).toEqual({
            searchStock: tools.searchStock,
            getQuote: {
                ...tools.getQuote,
                providerOptions: {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                },
            },
        })
    })

    test('leaves unsupported providers in standard system-plus-messages form', async () => {
        const { buildProviderCacheRequest } = await loadProviderCacheModule()
        const request = buildProviderCacheRequest({
            provider: 'openai',
            cachePlan: {
                ...cachePlan,
                provider: 'openai',
                eligibility: {
                    ...cachePlan.eligibility,
                    providerSupportsPromptCache: false,
                    cacheExpected: false,
                    cacheExpectationReason: 'provider_not_supported',
                },
            },
            systemSegments,
            modelMessages: [
                {
                    role: 'user',
                    content: 'hello',
                },
            ] as ModelMessage[],
            providerOptions: {
                anthropic: {
                    thinking: { type: 'enabled', budgetTokens: 2048 },
                },
            },
            tools,
        })

        expect(request.system).toBe(
            'base prompt\n\ntool instructions\n\nprefers ETFs\n\nmarket is open for 3 more hours',
        )
        expect(request.messages).toEqual([{ role: 'user', content: 'hello' }])
        expect(request.providerOptions).toEqual({
            anthropic: {
                thinking: { type: 'enabled', budgetTokens: 2048 },
            },
        })
        expect(request.tools).toEqual(tools)
    })

    test('leaves ineligible Anthropic requests in standard system-plus-messages form', async () => {
        const { buildProviderCacheRequest } = await loadProviderCacheModule()
        const request = buildProviderCacheRequest({
            provider: 'anthropic',
            cachePlan: {
                ...cachePlan,
                eligibility: {
                    ...cachePlan.eligibility,
                    cacheExpected: false,
                    prefixAboveThreshold: false,
                    cacheExpectationReason: 'below_cache_threshold',
                },
            },
            systemSegments,
            modelMessages: [
                {
                    role: 'user',
                    content: 'hello',
                },
            ] as ModelMessage[],
            providerOptions: {
                anthropic: {
                    thinking: { type: 'enabled', budgetTokens: 2048 },
                },
            },
            tools,
        })

        expect(request.system).toBe(
            'base prompt\n\ntool instructions\n\nprefers ETFs\n\nmarket is open for 3 more hours',
        )
        expect(request.messages).toEqual([{ role: 'user', content: 'hello' }])
        expect(request.providerOptions).toEqual({
            anthropic: {
                thinking: { type: 'enabled', budgetTokens: 2048 },
            },
        })
        expect(request.tools).toEqual(tools)
    })
})

describe('normalizeProviderCacheResult', () => {
    test('maps total usage cache fields into CacheResultSnapshot', async () => {
        const { normalizeProviderCacheResult } = await loadProviderCacheModule()
        const result = normalizeProviderCacheResult({
            cachePlan,
            totalUsage: {
                inputTokens: 1600,
                outputTokens: 80,
                inputTokenDetails: {
                    cacheReadTokens: 1200,
                    cacheWriteTokens: 300,
                    noCacheTokens: 100,
                },
            } as never,
            providerMetadata: {
                anthropic: {
                    cacheCreationInputTokens: 300,
                    usage: {
                        cache_creation_input_tokens: 300,
                        cache_read_input_tokens: 1200,
                        input_tokens: 1600,
                    },
                    some_unrelated_field: 'ignore me',
                    contextManagement: {
                        appliedEdits: [],
                    },
                },
                openai: {
                    requestId: 'req-123',
                },
            } as never,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })

        expect(result).toMatchObject({
            cacheObserved: true,
            evidenceSource: 'both',
            cacheReadObserved: true,
            cacheWriteObserved: true,
            cacheReadEvidenceSource: 'both',
            cacheWriteEvidenceSource: 'both',
            cacheReadTokens: 1200,
            cacheWriteTokens: 300,
            uncachedInputTokens: 100,
            cachedTokenRatio: 0.75,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })
        expect(result.providerRawCacheUsage).toEqual({
            anthropic: {
                cacheCreationInputTokens: 300,
                usage: {
                    cache_creation_input_tokens: 300,
                    cache_read_input_tokens: 1200,
                },
            },
        })
    })

    test('uses totalUsage as the evidence source when normalized cache tokens are present', async () => {
        const { normalizeProviderCacheResult } = await loadProviderCacheModule()

        const result = normalizeProviderCacheResult({
            cachePlan,
            totalUsage: {
                inputTokens: 1600,
                outputTokens: 80,
                inputTokenDetails: {
                    cacheReadTokens: 1200,
                    cacheWriteTokens: 300,
                    noCacheTokens: 100,
                },
            } as never,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })

        expect(result).toMatchObject({
            cacheObserved: true,
            evidenceSource: 'totalUsage',
            cacheReadObserved: true,
            cacheWriteObserved: true,
            cacheReadEvidenceSource: 'totalUsage',
            cacheWriteEvidenceSource: 'totalUsage',
            cacheReadTokens: 1200,
            cacheWriteTokens: 300,
            uncachedInputTokens: 100,
            cachedTokenRatio: 0.75,
        })
    })

    test('falls back to provider metadata when totalUsage lacks cache details', async () => {
        const { normalizeProviderCacheResult } = await loadProviderCacheModule()

        const result = normalizeProviderCacheResult({
            cachePlan,
            totalUsage: {
                inputTokens: 1600,
                outputTokens: 80,
            } as never,
            providerMetadata: {
                anthropic: {
                    usage: {
                        cache_creation_input_tokens: 300,
                        cache_read_input_tokens: 1200,
                    },
                },
            } as never,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })

        expect(result).toMatchObject({
            cacheObserved: true,
            evidenceSource: 'providerMetadata',
            cacheReadObserved: true,
            cacheWriteObserved: true,
            cacheReadEvidenceSource: 'providerMetadata',
            cacheWriteEvidenceSource: 'providerMetadata',
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
            uncachedInputTokens: undefined,
            cachedTokenRatio: undefined,
        })
        expect(result.providerRawCacheUsage).toEqual({
            anthropic: {
                usage: {
                    cache_creation_input_tokens: 300,
                    cache_read_input_tokens: 1200,
                },
            },
        })
    })

    test('records both evidence sources when normalized usage and metadata are positive', async () => {
        const { normalizeProviderCacheResult } = await loadProviderCacheModule()

        const result = normalizeProviderCacheResult({
            cachePlan,
            totalUsage: {
                inputTokens: 1600,
                outputTokens: 80,
                inputTokenDetails: {
                    cacheReadTokens: 1200,
                    cacheWriteTokens: 300,
                    noCacheTokens: 100,
                },
            } as never,
            providerMetadata: {
                anthropic: {
                    usage: {
                        cache_creation_input_tokens: 300,
                        cache_read_input_tokens: 1200,
                    },
                },
            } as never,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })

        expect(result.cacheObserved).toBe(true)
        expect(result.evidenceSource).toBe('both')
        expect(result.cacheReadObserved).toBe(true)
        expect(result.cacheWriteObserved).toBe(true)
        expect(result.cacheReadEvidenceSource).toBe('both')
        expect(result.cacheWriteEvidenceSource).toBe('both')
    })

    test('separates provider metadata read evidence from write evidence', async () => {
        const { normalizeProviderCacheResult } = await loadProviderCacheModule()

        const result = normalizeProviderCacheResult({
            cachePlan,
            totalUsage: {
                inputTokens: 1600,
                outputTokens: 80,
            } as never,
            providerMetadata: {
                anthropic: {
                    usage: {
                        cache_read_input_tokens: 1200,
                    },
                },
            } as never,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })

        expect(result.cacheObserved).toBe(true)
        expect(result.evidenceSource).toBe('providerMetadata')
        expect(result.cacheReadObserved).toBe(true)
        expect(result.cacheWriteObserved).toBe(false)
        expect(result.cacheReadEvidenceSource).toBe('providerMetadata')
        expect(result.cacheWriteEvidenceSource).toBe('none')
    })

    test('separates total usage write evidence from read evidence', async () => {
        const { normalizeProviderCacheResult } = await loadProviderCacheModule()

        const result = normalizeProviderCacheResult({
            cachePlan,
            totalUsage: {
                inputTokens: 1600,
                outputTokens: 80,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 500,
                    noCacheTokens: 1100,
                },
            } as never,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })

        expect(result.cacheObserved).toBe(true)
        expect(result.evidenceSource).toBe('totalUsage')
        expect(result.cacheReadObserved).toBe(false)
        expect(result.cacheWriteObserved).toBe(true)
        expect(result.cacheReadEvidenceSource).toBe('none')
        expect(result.cacheWriteEvidenceSource).toBe('totalUsage')
        expect(result.cachedTokenRatio).toBe(0)
    })

    test('records providerMetadata when metadata is positive but normalized usage is zero', async () => {
        const { normalizeProviderCacheResult } = await loadProviderCacheModule()

        const result = normalizeProviderCacheResult({
            cachePlan,
            totalUsage: {
                inputTokens: 1600,
                outputTokens: 80,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    noCacheTokens: 1600,
                },
            } as never,
            providerMetadata: {
                anthropic: {
                    usage: {
                        cache_read_input_tokens: 1200,
                    },
                },
            } as never,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })

        expect(result.cacheObserved).toBe(true)
        expect(result.evidenceSource).toBe('providerMetadata')
        expect(result.cacheReadObserved).toBe(true)
        expect(result.cacheWriteObserved).toBe(false)
        expect(result.cacheReadEvidenceSource).toBe('providerMetadata')
        expect(result.cacheWriteEvidenceSource).toBe('none')
        expect(result.cacheReadTokens).toBe(0)
        expect(result.uncachedInputTokens).toBe(1600)
    })

    test('records none when no positive cache evidence is present', async () => {
        const { normalizeProviderCacheResult } = await loadProviderCacheModule()

        const result = normalizeProviderCacheResult({
            cachePlan,
            totalUsage: {
                inputTokens: 1600,
                outputTokens: 80,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    noCacheTokens: 1600,
                },
            } as never,
            providerMetadata: {
                anthropic: {
                    usage: {
                        input_tokens: 1600,
                    },
                },
            } as never,
            rolloutGateStatus: 'observe-only',
            circuitBreakerState: 'closed',
        })

        expect(result).toMatchObject({
            cacheObserved: false,
            evidenceSource: 'none',
            cacheReadObserved: false,
            cacheWriteObserved: false,
            cacheReadEvidenceSource: 'none',
            cacheWriteEvidenceSource: 'none',
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            uncachedInputTokens: 1600,
            cachedTokenRatio: 0,
        })
    })

    test('does not treat malformed totalUsage cache token values as positive evidence', async () => {
        const { normalizeProviderCacheResult } = await loadProviderCacheModule()
        const malformedInputTokenDetails = [
            {
                cacheReadTokens: '1200',
                cacheWriteTokens: 0,
                noCacheTokens: 1600,
            },
            {
                cacheReadTokens: 0,
                cacheWriteTokens: '300',
                noCacheTokens: 1600,
            },
            {
                cacheReadTokens: null,
                cacheWriteTokens: undefined,
                noCacheTokens: 1600,
            },
            {
                cacheReadTokens: -1200,
                cacheWriteTokens: -300,
                noCacheTokens: 1600,
            },
        ]

        for (const inputTokenDetails of malformedInputTokenDetails) {
            const result = normalizeProviderCacheResult({
                cachePlan,
                totalUsage: {
                    inputTokens: 1600,
                    outputTokens: 80,
                    inputTokenDetails,
                } as never,
                rolloutGateStatus: 'enabled',
                circuitBreakerState: 'closed',
            })

            expect(result).toMatchObject({
                cacheObserved: false,
                evidenceSource: 'none',
                cacheReadObserved: false,
                cacheWriteObserved: false,
                cacheReadEvidenceSource: 'none',
                cacheWriteEvidenceSource: 'none',
            })
        }
    })

    test('does not treat zero or malformed provider metadata values as directional evidence', async () => {
        const { normalizeProviderCacheResult } = await loadProviderCacheModule()

        const result = normalizeProviderCacheResult({
            cachePlan,
            totalUsage: {
                inputTokens: 1600,
                outputTokens: 80,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    noCacheTokens: 1600,
                },
            } as never,
            providerMetadata: {
                anthropic: {
                    cacheCreationInputTokens: '300',
                    usage: {
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: '1200',
                    },
                },
            } as never,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })

        expect(result).toMatchObject({
            cacheObserved: false,
            evidenceSource: 'none',
            cacheReadObserved: false,
            cacheWriteObserved: false,
            cacheReadEvidenceSource: 'none',
            cacheWriteEvidenceSource: 'none',
        })
        expect(result.providerRawCacheUsage).toEqual({
            anthropic: {
                cacheCreationInputTokens: '300',
                usage: {
                    cache_creation_input_tokens: 0,
                    cache_read_input_tokens: '1200',
                },
            },
        })
    })
})
