import { describe, expect, test } from 'bun:test'
import { buildCachePlan } from '../../../../src/core/ai/runtime/cache-plan'
import type {
    CachePlanSnapshot,
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

function createPlan(
    overrides: Partial<Parameters<typeof buildCachePlan>[0]> = {},
): CachePlanSnapshot {
    return buildCachePlan({
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        assembledContext: {
            segments: [
                ...systemSegments,
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
            systemSegments,
            tools,
            params: { candidates: [], resolved: {} },
            totalEstimatedInputTokens: 1420,
        },
        providerChangeFlags: {},
        ...overrides,
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
        expect(plan.eligibility.cacheExpected).toBe(true)
        expect(plan.eligibility.prefixAboveThreshold).toBe(true)
        expect(plan.eligibility.cacheExpectationReason).toBe(
            'stable_prefix_ready',
        )
    })

    test('hashes full tool definitions and flags tool-definition drift', () => {
        const previous = createPlan()

        const current = buildCachePlan({
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            assembledContext: {
                segments: [
                    ...systemSegments,
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
            providerChangeFlags: {},
            previousPlan: previous,
        })

        expect(current.hashes.toolDefinitionsHash).not.toBe(
            previous.hashes.toolDefinitionsHash,
        )
        expect(current.candidateInvalidationReasons).toContain(
            'tool_definitions_changed',
        )
        expect(current.candidateInvalidationReasons).not.toContain(
            'memory_changed',
        )
    })
})
