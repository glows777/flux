import { describe, expect, test } from 'bun:test'
import {
    assembleParams,
    assembleSegments,
    assembleTools,
} from '../../../../src/core/ai/runtime/assembly'
import type {
    ContextSegment,
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
})

describe('assembleParams', () => {
    test('uses last-writer-wins in plugin order', () => {
        const result = assembleParams(
            { maxSteps: 20, temperature: 0.1 },
            [
                { plugin: 'trading', params: { maxSteps: 50 } },
                { plugin: 'skill', params: { temperature: 0.4 } },
                { plugin: 'heartbeat', params: { maxSteps: 80 } },
            ],
        )

        expect(result.resolved.maxSteps).toBe(80)
        expect(result.resolved.temperature).toBe(0.4)
    })
})

