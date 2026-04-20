import { describe, expect, mock, test } from 'bun:test'
import type { AIPlugin } from '../../../../src/core/ai/runtime/types'

const mockConvertToModelMessages = mock(async (messages: unknown[]) => messages)
const mockStepCountIs = mock((_count: number) => () => false)
const mockStreamText = mock(() => ({
    text: Promise.resolve('mock text'),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    steps: Promise.resolve([]),
    toUIMessageStream: (_opts?: unknown) => new ReadableStream(),
    toUIMessageStreamResponse: (_opts?: unknown) =>
        new Response('data: test\n\n', {
            headers: { 'Content-Type': 'text/event-stream' },
        }),
}))

mock.module('ai', async () => {
    return {
        convertToModelMessages: mockConvertToModelMessages,
        stepCountIs: mockStepCountIs,
        streamText: mockStreamText,
    }
})

async function loadCreateAIRuntime() {
    const mod = await import('../../../../src/core/ai/runtime/create')
    return mod.createAIRuntime
}

const mockModel = {} as never

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
