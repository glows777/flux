import { describe, expect, test } from 'bun:test'
import {
    assembleParams,
    assembleSegments,
    assembleTools,
} from '../../../../src/core/ai/runtime/assembly'
import { InvalidContextSegmentError } from '../../../../src/core/ai/runtime/errors'
import {
    addSystemSegmentOverhead,
    estimateMessages,
    estimateTextTokens,
    estimateToolSpec,
} from '../../../../src/core/ai/runtime/token-estimator'
import type {
    ContextSegment,
    ChatParams,
    ToolContribution,
} from '../../../../src/core/ai/runtime/types'

describe('assembleSegments', () => {
    test('orders system segments by priority then kind rank', () => {
        const segments: ContextSegment[] = [
            {
                id: 'live',
                target: 'system',
                kind: 'live.runtime',
                payload: { format: 'text', text: 'live' },
                source: { plugin: 'heartbeat' },
                priority: 'high',
                cacheability: 'volatile',
                compactability: 'preserve',
            },
            {
                id: 'base',
                target: 'system',
                kind: 'system.base',
                payload: { format: 'text', text: 'base' },
                source: { plugin: 'prompt' },
                priority: 'high',
                cacheability: 'stable',
                compactability: 'preserve',
            },
        ]

        const result = assembleSegments({
            rawMessages: [],
            pluginSegments: segments,
        })

        expect(result.systemSegments.map((segment) => segment.id)).toEqual([
            'base',
            'live',
        ])
    })

    test('annotates system segments with included/finalOrder/estimatedTokens', () => {
        const result = assembleSegments({
            rawMessages: [],
            pluginSegments: [
                {
                    id: 'base',
                    target: 'system',
                    kind: 'system.base',
                    payload: { format: 'text', text: 'base' },
                    source: { plugin: 'prompt' },
                    priority: 'high',
                    cacheability: 'stable',
                    compactability: 'preserve',
                },
                {
                    id: 'live',
                    target: 'system',
                    kind: 'live.runtime',
                    payload: { format: 'text', text: 'live' },
                    source: { plugin: 'heartbeat' },
                    priority: 'high',
                    cacheability: 'volatile',
                    compactability: 'preserve',
                },
            ],
        })

        expect(result.systemSegments[0]).toMatchObject({
            id: 'base',
            included: true,
            finalOrder: 0,
            estimatedTokens: addSystemSegmentOverhead(estimateTextTokens('base')),
        })
        expect(result.systemSegments[1]).toMatchObject({
            id: 'live',
            included: true,
            finalOrder: 1,
            estimatedTokens: addSystemSegmentOverhead(estimateTextTokens('live')),
        })
    })

    test('computes totalEstimatedTokens', () => {
        const rawMessages = [
            {
                id: 'm1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            },
        ]
        const result = assembleSegments({
            rawMessages,
            pluginSegments: [
                {
                    id: 'base',
                    target: 'system',
                    kind: 'system.base',
                    payload: { format: 'text', text: 'base' },
                    source: { plugin: 'prompt' },
                    priority: 'high',
                    cacheability: 'stable',
                    compactability: 'preserve',
                },
            ],
        })

        const expected =
            addSystemSegmentOverhead(estimateTextTokens('base')) +
            estimateMessages(rawMessages)

        expect(result.totalEstimatedTokens).toBe(expected)
    })

    test('prefers contributed message segments over raw messages', () => {
        const result = assembleSegments({
            rawMessages: [
                {
                    id: 'raw',
                    role: 'user',
                    parts: [{ type: 'text', text: 'raw' }],
                },
            ],
            pluginSegments: [
                {
                    id: 'history',
                    target: 'messages',
                    kind: 'history.recent',
                    payload: {
                        format: 'messages',
                        messages: [
                            {
                                id: 'db',
                                role: 'user',
                                parts: [{ type: 'text', text: 'db' }],
                            },
                        ],
                    },
                    source: { plugin: 'session' },
                    priority: 'high',
                    cacheability: 'session',
                    compactability: 'summarize',
                },
            ],
        })

        expect(result.modelMessages[0].id).toBe('db')
    })

    test('throws when a messages target segment payload.format != "messages"', () => {
        expect(() =>
            assembleSegments({
                rawMessages: [],
                pluginSegments: [
                    {
                        id: 'bad',
                        target: 'messages',
                        kind: 'history.recent',
                        payload: { format: 'text', text: 'nope' },
                        source: { plugin: 'session' },
                        priority: 'high',
                        cacheability: 'session',
                        compactability: 'summarize',
                    },
                ],
            }),
        ).toThrow(
            new InvalidContextSegmentError(
                'bad',
                'messages target requires payload.format = "messages"',
            ).message,
        )
    })
})

describe('assembleTools', () => {
    test('throws on duplicate tool names', () => {
        const tools: ToolContribution[] = [
            {
                name: 'getQuote',
                definition: { tool: {} as never },
                source: 'data',
                manifestSpec: { description: 'quote' },
            },
            {
                name: 'getQuote',
                definition: { tool: {} as never },
                source: 'research',
                manifestSpec: { description: 'quote duplicate' },
            },
        ]

        expect(() => assembleTools(tools)).toThrow('getQuote')
    })

    test('returns aiTools, manifestTools, and totalEstimatedTokens', () => {
        const tools: ToolContribution[] = [
            {
                name: 'getQuote',
                definition: { tool: { fake: true } as never },
                source: 'data',
                manifestSpec: { description: 'quote' },
            },
            {
                name: 'getNews',
                definition: { tool: { fake: true } as never },
                source: 'research',
                manifestSpec: { description: 'news' },
            },
        ]

        const result = assembleTools(tools)

        expect(Object.keys(result.aiTools)).toEqual(['getQuote', 'getNews'])
        expect(result.manifestTools.map((t) => t.name)).toEqual([
            'getQuote',
            'getNews',
        ])
        expect(result.manifestTools[0].estimatedTokens).toBe(
            estimateToolSpec(tools[0].manifestSpec),
        )
        expect(result.totalEstimatedTokens).toBe(
            estimateToolSpec(tools[0].manifestSpec) +
                estimateToolSpec(tools[1].manifestSpec),
        )
    })
})

describe('assembleParams', () => {
    test('uses last-writer-wins in plugin order', () => {
        const defaults: ChatParams = { maxSteps: 20, temperature: 0.1 }
        const result = assembleParams(
            defaults,
            [
                { plugin: 'trading', params: { maxSteps: 50 } },
                { plugin: 'skill', params: { temperature: 0.4 } },
                { plugin: 'heartbeat', params: { maxSteps: 80 } },
            ],
        )

        expect(result.resolved.maxSteps).toBe(80)
        expect(result.resolved.temperature).toBe(0.4)
    })

    test('emits candidates per provided key/value and ignores undefined values', () => {
        const defaults: ChatParams = { maxSteps: 20, temperature: 0.1 }
        const result = assembleParams(defaults, [
            { plugin: 'a', params: { maxSteps: 50, temperature: undefined } },
            { plugin: 'b', params: { temperature: 0.7 } },
        ])

        expect(result.candidates).toEqual([
            { plugin: 'a', key: 'maxSteps', value: 50 },
            { plugin: 'b', key: 'temperature', value: 0.7 },
        ])
        expect(result.resolved).toEqual({ maxSteps: 50, temperature: 0.7 })
    })
})
