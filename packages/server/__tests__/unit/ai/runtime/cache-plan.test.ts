import { describe, expect, test } from 'bun:test'
import { buildCachePlan } from '../../../../src/core/ai/runtime/cache-plan'
import type {
    CachePlanSnapshot,
    ContextSegmentSnapshot,
    SystemContextSegmentSnapshot,
    ToolContributionSnapshot,
} from '../../../../src/core/ai/runtime/types'

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
]

const tools: ToolContributionSnapshot[] = [
    {
        name: 'searchStock',
        definition: {
            tool: {
                description: 'Search stock by symbol',
                inputSchema: {
                    type: 'object',
                    properties: {
                        symbol: { type: 'string' },
                    },
                    required: ['symbol'],
                },
            } as never,
        },
        source: 'trading',
        manifestSpec: {
            description: 'Search stock by symbol',
            inputSchemaSummary: {
                type: 'object',
                properties: {
                    symbol: { type: 'string' },
                },
                required: ['symbol'],
            },
        },
        estimatedTokens: 120,
    },
    {
        name: 'getQuote',
        definition: {
            tool: {
                description: 'Get quote',
                inputSchema: {
                    type: 'object',
                    properties: {
                        symbol: { type: 'string' },
                        exchange: { type: 'string' },
                    },
                    required: ['symbol'],
                },
            } as never,
        },
        source: 'trading',
        manifestSpec: {
            description: 'Get quote',
            inputSchemaSummary: {
                type: 'object',
                properties: {
                    symbol: { type: 'string' },
                    exchange: { type: 'string' },
                },
                required: ['symbol'],
            },
        },
        estimatedTokens: 80,
    },
]

const historySegment: ContextSegmentSnapshot = {
    id: 'session-history',
    target: 'messages',
    kind: 'history.recent',
    payload: { format: 'messages', messages: [] },
    source: { plugin: 'session' },
    priority: 'high',
    cacheability: 'session',
    compactability: 'summarize',
}

function createPlan(
    overrides: Partial<{
        provider: 'anthropic' | 'openai' | 'unknown'
        segments: ContextSegmentSnapshot[]
        systemSegments: SystemContextSegmentSnapshot[]
        tools: ToolContributionSnapshot[]
        totalEstimatedInputTokens: number
    }> = {},
): CachePlanSnapshot {
    const system = overrides.systemSegments ?? systemSegments

    return buildCachePlan({
        provider: overrides.provider ?? 'anthropic',
        modelId: 'claude-sonnet-4-6',
        assembledContext: {
            segments: overrides.segments ?? [...system, historySegment],
            systemSegments: system,
            tools: overrides.tools ?? tools,
            params: { candidates: [], resolved: {} },
            totalEstimatedInputTokens:
                overrides.totalEstimatedInputTokens ?? 1420,
        },
    })
}

describe('buildCachePlan', () => {
    test('splits stable core, cacheable session, and dynamic tail', () => {
        const plan = createPlan()

        expect(plan.stableCoreSegmentIds).toEqual([
            'global-base',
            'global-instructions',
        ])
        expect(plan.cacheableSessionSegmentIds).toEqual(['memory-context'])
        expect(plan.dynamicTailSegmentIds).toContain('session-history')
        expect(plan.breakpoints).toEqual([
            { layer: 'stableCore', segmentId: 'global-instructions' },
            { layer: 'cacheableSession', segmentId: 'memory-context' },
        ])
        expect(plan.effectivePrefixSegmentIds).toEqual([
            'global-base',
            'global-instructions',
            'memory-context',
        ])
        expect(Object.keys(plan.hashes).sort()).toEqual([
            'dynamicTailHash',
            'memoryHash',
            'systemHash',
            'toolDefinitionsHash',
        ])
        expect('providerChangeFlags' in plan).toBe(false)
        expect(plan.eligibility.cacheExpected).toBe(true)
        expect(plan.eligibility.prefixAboveThreshold).toBe(true)
        expect(plan.eligibility.cacheExpectationReason).toBe(
            'stable_prefix_ready',
        )
    })

    test('hashes full tool definitions without producing local invalidation reasons', () => {
        const previous = createPlan()

        const current = buildCachePlan({
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            assembledContext: {
                segments: [...systemSegments, historySegment],
                systemSegments,
                tools: [
                    {
                        ...tools[0],
                        definition: {
                            tool: {
                                description: 'Search stock by symbol',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        symbol: { type: 'string' },
                                    },
                                    required: ['symbol'],
                                },
                                execute: () => undefined,
                            } as never,
                        },
                    },
                    tools[1],
                ],
                params: { candidates: [], resolved: {} },
                totalEstimatedInputTokens: 1420,
            },
        })

        expect(current.hashes.toolDefinitionsHash).not.toBe(
            previous.hashes.toolDefinitionsHash,
        )
        expect('candidateInvalidationReasons' in current).toBe(false)
    })

    test('disables cache expectations for non-anthropic providers', () => {
        const plan = createPlan({ provider: 'openai' })

        expect(plan.eligibility.providerSupportsPromptCache).toBe(false)
        expect(plan.eligibility.cacheExpected).toBe(false)
        expect(plan.eligibility.cacheExpectationReason).toBe(
            'provider_not_supported',
        )
    })

    test('marks low-prefix requests below the Anthropic threshold', () => {
        const lowPrefixBase: SystemContextSegmentSnapshot = {
            id: 'small-base',
            target: 'system',
            kind: 'system.base',
            payload: { format: 'text', text: 'small base' },
            source: { plugin: 'prompt' },
            priority: 'required',
            cacheability: 'stable',
            compactability: 'preserve',
            included: true,
            finalOrder: 0,
            estimatedTokens: 100,
        }

        const plan = createPlan({
            systemSegments: [lowPrefixBase],
            segments: [lowPrefixBase],
            tools: [],
            totalEstimatedInputTokens: 100,
        })

        expect(plan.eligibility.prefixAboveThreshold).toBe(false)
        expect(plan.eligibility.cacheExpected).toBe(false)
        expect(plan.eligibility.cacheExpectationReason).toBe(
            'below_cache_threshold',
        )
    })

    test('counts tool tokens while keeping dynamic tail outside the cache prefix threshold', () => {
        const nearThresholdBase: SystemContextSegmentSnapshot = {
            id: 'near-threshold-base',
            target: 'system',
            kind: 'system.base',
            payload: { format: 'text', text: 'near threshold base' },
            source: { plugin: 'prompt' },
            priority: 'required',
            cacheability: 'stable',
            compactability: 'preserve',
            included: true,
            finalOrder: 0,
            estimatedTokens: 900,
        }

        const plan = createPlan({
            systemSegments: [nearThresholdBase],
            segments: [
                nearThresholdBase,
                {
                    id: 'session-history',
                    target: 'messages',
                    kind: 'history.recent',
                    payload: { format: 'messages', messages: [] },
                    source: { plugin: 'session' },
                    priority: 'high',
                    cacheability: 'session',
                    compactability: 'summarize',
                },
            ],
            tools: [
                {
                    ...tools[0],
                    estimatedTokens: 300,
                },
            ],
            totalEstimatedInputTokens: 1200,
        })

        expect(plan.effectivePrefixEstimatedTokens).toBe(1200)
        expect(plan.eligibility.prefixAboveThreshold).toBe(true)
        expect(plan.eligibility.cacheExpected).toBe(true)
        expect(plan.dynamicTailSegmentIds).toContain('session-history')
    })

    test('counts stable tool definitions toward the anthropic cache threshold', () => {
        const nearThresholdBase: SystemContextSegmentSnapshot = {
            id: 'near-threshold-base',
            target: 'system',
            kind: 'system.base',
            payload: { format: 'text', text: 'near threshold base' },
            source: { plugin: 'prompt' },
            priority: 'required',
            cacheability: 'stable',
            compactability: 'preserve',
            included: true,
            finalOrder: 0,
            estimatedTokens: 900,
        }

        const plan = createPlan({
            systemSegments: [nearThresholdBase],
            segments: [nearThresholdBase],
            tools: [
                {
                    ...tools[0],
                    estimatedTokens: 140,
                },
            ],
            totalEstimatedInputTokens: 1040,
        })

        expect(plan.effectivePrefixEstimatedTokens).toBe(1040)
        expect(plan.eligibility.prefixAboveThreshold).toBe(true)
        expect(plan.eligibility.cacheExpected).toBe(true)
        expect(plan.eligibility.cacheExpectationReason).toBe(
            'stable_prefix_ready',
        )
    })

    test('keeps volatile memory out of cacheableSession', () => {
        const base: SystemContextSegmentSnapshot = {
            id: 'small-base',
            target: 'system',
            kind: 'system.base',
            payload: { format: 'text', text: 'small base' },
            source: { plugin: 'prompt' },
            priority: 'required',
            cacheability: 'stable',
            compactability: 'preserve',
            included: true,
            finalOrder: 0,
            estimatedTokens: 600,
        }
        const volatileMemory: ContextSegmentSnapshot = {
            id: 'memory-volatile',
            target: 'system',
            kind: 'memory.long_lived',
            payload: { format: 'text', text: 'volatile memory' },
            source: { plugin: 'prompt' },
            priority: 'high',
            cacheability: 'volatile',
            compactability: 'summarize',
            included: true,
            finalOrder: 1,
            estimatedTokens: 100,
        }

        const plan = createPlan({
            systemSegments: [base],
            segments: [base, volatileMemory],
            tools: [],
            totalEstimatedInputTokens: 700,
        })

        expect(plan.stableCoreSegmentIds).toEqual(['small-base'])
        expect(plan.cacheableSessionSegmentIds).not.toContain('memory-volatile')
        expect(plan.dynamicTailSegmentIds).toContain('memory-volatile')
    })

    test('keeps live runtime context in the dynamic tail without local miss inference', () => {
        const base: SystemContextSegmentSnapshot = {
            id: 'small-base',
            target: 'system',
            kind: 'system.base',
            payload: { format: 'text', text: 'small base' },
            source: { plugin: 'prompt' },
            priority: 'required',
            cacheability: 'stable',
            compactability: 'preserve',
            included: true,
            finalOrder: 0,
            estimatedTokens: 600,
        }
        const liveContext: ContextSegmentSnapshot = {
            id: 'live-context',
            target: 'system',
            kind: 'live.runtime',
            payload: { format: 'text', text: 'live two' },
            source: { plugin: 'heartbeat' },
            priority: 'high',
            cacheability: 'volatile',
            compactability: 'preserve',
            included: true,
            finalOrder: 1,
            estimatedTokens: 100,
        }

        const plan = createPlan({
            systemSegments: [base],
            segments: [base, liveContext],
            tools: [],
            totalEstimatedInputTokens: 700,
        })

        expect(plan.dynamicTailSegmentIds).toContain('live-context')
        expect('candidateInvalidationReasons' in plan).toBe(false)
    })
})
