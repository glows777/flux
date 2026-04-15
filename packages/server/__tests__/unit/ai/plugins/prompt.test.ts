import { describe, expect, mock, test } from 'bun:test'
import { promptPlugin } from '../../../../src/core/ai/plugins/prompt'
import type { HookContext } from '../../../../src/core/ai/runtime/types'

const makeDeps = (
    overrides: Record<string, unknown> = {},
): {
    buildGlobalSystemPrompt: ReturnType<typeof mock>
    loadMemoryContext: ReturnType<typeof mock>
} => ({
    buildGlobalSystemPrompt: mock(() => ''),
    loadMemoryContext: mock(() => Promise.resolve('')),
    ...overrides,
})

describe('promptPlugin', () => {
    test('has name "prompt"', () => {
        expect(promptPlugin({ deps: makeDeps() }).name).toBe('prompt')
    })

    test('no args defaults to building global prompt', () => {
        const plugin = promptPlugin()
        expect(plugin.name).toBe('prompt')
    })

    test('systemPrompt calls buildGlobalSystemPrompt with memoryContext', async () => {
        const mockBuild = mock(() => 'global prompt')
        const mockLoadMemory = mock(() => Promise.resolve('memory ctx'))
        const plugin = promptPlugin({
            deps: makeDeps({
                buildGlobalSystemPrompt: mockBuild,
                loadMemoryContext: mockLoadMemory,
            }),
        })
        const ctx: HookContext = {
            sessionId: 's1',
            channel: 'web',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        }
        expect(plugin.systemPrompt).toBeDefined()
        if (typeof plugin.systemPrompt !== 'function') {
            throw new Error('Expected prompt plugin systemPrompt factory')
        }

        const prompt = await plugin.systemPrompt(ctx)
        expect(prompt).toBe('global prompt')
        expect(mockBuild).toHaveBeenCalledWith({ memoryContext: 'memory ctx' })
    })

    test('systemPrompt loads memory context', async () => {
        const mockLoadMemory = mock(() => Promise.resolve('mem'))
        const plugin = promptPlugin({
            deps: makeDeps({
                loadMemoryContext: mockLoadMemory,
            }),
        })
        const ctx: HookContext = {
            sessionId: 's1',
            channel: 'cron',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        }
        expect(plugin.systemPrompt).toBeDefined()
        if (typeof plugin.systemPrompt !== 'function') {
            throw new Error('Expected prompt plugin systemPrompt factory')
        }

        await plugin.systemPrompt(ctx)
        expect(mockLoadMemory).toHaveBeenCalled()
    })
})
