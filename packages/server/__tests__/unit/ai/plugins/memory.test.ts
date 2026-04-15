import { describe, expect, mock, test } from 'bun:test'
import type { StoreDeps } from '../../../../src/core/ai/memory/store'
import { memoryPlugin } from '../../../../src/core/ai/plugins/memory'
import type { HookContext } from '../../../../src/core/ai/runtime/types'

function makeCtx(): HookContext {
    return {
        sessionId: 's1',
        channel: 'web',
        agentType: 'trading-agent',
        rawMessages: [],
        meta: new Map(),
    }
}

function makeMockDb() {
    return {
        memoryVersion: {
            findFirst: mock(() => Promise.resolve(null)),
            findMany: mock(() => Promise.resolve([])),
            create: mock(() => Promise.resolve({ id: 'v1' })),
        },
    } as unknown as StoreDeps['db']
}

describe('memoryPlugin', () => {
    test('has name "memory"', () => {
        const plugin = memoryPlugin()
        expect(plugin.name).toBe('memory')
    })

    test('provides update_core_memory and save_lesson for trading-agent', async () => {
        const plugin = memoryPlugin({ deps: { db: makeMockDb() } })
        expect(plugin.tools).toBeDefined()
        if (typeof plugin.tools !== 'function') {
            throw new Error('Expected memory plugin tools factory')
        }

        const tools = await plugin.tools(makeCtx())
        expect(Object.keys(tools)).toContain('update_core_memory')
        expect(Object.keys(tools)).toContain('save_lesson')
        expect(Object.keys(tools)).not.toContain('read_history')
        expect(Object.keys(tools)).toHaveLength(2)
    })

    test('provides read_history when includeHistory=true (auto-trading-agent)', async () => {
        const plugin = memoryPlugin({
            includeHistory: true,
            deps: { db: makeMockDb() },
        })
        expect(plugin.tools).toBeDefined()
        if (typeof plugin.tools !== 'function') {
            throw new Error('Expected memory plugin tools factory')
        }

        const tools = await plugin.tools(makeCtx())
        expect(Object.keys(tools)).toContain('update_core_memory')
        expect(Object.keys(tools)).toContain('save_lesson')
        expect(Object.keys(tools)).toContain('read_history')
        expect(Object.keys(tools)).toHaveLength(3)
    })

    test('does NOT provide systemPrompt', () => {
        const plugin = memoryPlugin()
        expect(plugin.systemPrompt).toBeUndefined()
    })

    test('does NOT provide afterChat hook', () => {
        const plugin = memoryPlugin()
        expect(plugin.afterChat).toBeUndefined()
    })
})
