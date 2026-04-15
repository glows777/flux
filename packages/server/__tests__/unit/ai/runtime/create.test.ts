import { describe, expect, test } from 'bun:test'
import { createAIRuntime } from '../../../../src/core/ai/runtime/create'
import type { AIPlugin } from '../../../../src/core/ai/runtime/types'

const mockModel = {} as Parameters<typeof createAIRuntime>[0]['model']

describe('createAIRuntime', () => {
    test('rejects duplicate plugin names', async () => {
        const plugins: AIPlugin[] = [{ name: 'dup' }, { name: 'dup' }]
        expect(createAIRuntime({ model: mockModel, plugins })).rejects.toThrow(
            'Duplicate plugin name: "dup"',
        )
    })

    test('calls init() on all plugins in order', async () => {
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

    test('validates static tool uniqueness at creation time', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'a',
                tools: { same: { tool: {} as Record<string, never> } },
            },
            {
                name: 'b',
                tools: { same: { tool: {} as Record<string, never> } },
            },
        ]
        expect(createAIRuntime({ model: mockModel, plugins })).rejects.toThrow(
            'same',
        )
    })

    test('returns runtime with chat, getToolDisplayMap, dispose', async () => {
        const runtime = await createAIRuntime({ model: mockModel, plugins: [] })
        expect(typeof runtime.chat).toBe('function')
        expect(typeof runtime.getToolDisplayMap).toBe('function')
        expect(typeof runtime.dispose).toBe('function')
    })

    test('dispose() calls destroy() on all plugins', async () => {
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

    test('getToolDisplayMap returns display metadata from static tools', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'data',
                tools: {
                    getQuote: {
                        tool: {} as Record<string, never>,
                        display: {
                            loadingLabel: () => '查询报价',
                            completionSummary: () => '$150',
                            category: 'data' as const,
                        },
                    },
                    getHistory: {
                        tool: {} as Record<string, never>,
                        // no display
                    },
                },
            },
        ]
        const runtime = await createAIRuntime({ model: mockModel, plugins })
        const map = runtime.getToolDisplayMap()
        expect(map.getQuote).toBeDefined()
        expect(map.getQuote.category).toBe('data')
        expect(map.getHistory).toBeUndefined()
    })
})
