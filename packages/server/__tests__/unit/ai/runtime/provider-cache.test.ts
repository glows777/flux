import { describe, expect, test } from 'bun:test'
import type { ModelMessage } from 'ai'
import {
    buildProviderCacheRequest,
    normalizeProviderCacheResult,
} from '../../../../src/core/ai/runtime/provider-cache'
import type {
    CachePlanSnapshot,
    SystemContextSegmentSnapshot,
} from '../../../../src/core/ai/runtime/types'

const cachePlan: CachePlanSnapshot = {
    provider: 'anthropic',
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
        stableCoreHash: 'core-hash',
        effectivePrefixHash: 'prefix-hash',
        dynamicTailHash: 'tail-hash',
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

describe('buildProviderCacheRequest', () => {
    test('rewrites Anthropic system layers into separate cached system messages', () => {
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
        })

        expect(request.system).toBe('market is open for 3 more hours')
        expect(request.messages[0]).toMatchObject({
            role: 'system',
            content: 'base prompt\n\ntool instructions',
            providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
            },
        })
        expect(request.messages[1]).toMatchObject({
            role: 'system',
            content: 'prefers ETFs',
            providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
            },
        })
        expect(request.messages[2]).toEqual({
            role: 'user',
            content: 'hello',
        })
        expect(request.providerOptions).toEqual({
            anthropic: {
                thinking: { type: 'enabled', budgetTokens: 2048 },
            },
        })
    })

    test('leaves unsupported providers in standard system-plus-messages form', () => {
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
    })

    test('leaves ineligible Anthropic requests in standard system-plus-messages form', () => {
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
    })
})

describe('normalizeProviderCacheResult', () => {
    test('maps total usage cache fields into CacheResultSnapshot', () => {
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
                    cache_creation_input_tokens: 300,
                    cache_read_input_tokens: 1200,
                },
            } as never,
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })

        expect(result).toMatchObject({
            cacheObserved: true,
            cacheReadTokens: 1200,
            cacheWriteTokens: 300,
            uncachedInputTokens: 100,
            cachedTokenRatio: 0.75,
            providerRawCacheUsage: {
                anthropic: {
                    cache_creation_input_tokens: 300,
                    cache_read_input_tokens: 1200,
                },
            },
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })
    })
})
