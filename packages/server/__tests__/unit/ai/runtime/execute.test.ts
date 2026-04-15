import { describe, expect, test } from 'bun:test'
import { ToolConflictError } from '../../../../src/core/ai/runtime/errors'
import {
    collectSystemPrompts,
    collectTools,
    runAfterChatHooks,
    runTransformChain,
} from '../../../../src/core/ai/runtime/execute'
import type {
    AfterChatContext,
    AIPlugin,
    ChatParams,
    HookContext,
} from '../../../../src/core/ai/runtime/types'

const baseCtx: HookContext = {
    sessionId: 'sess-1',
    channel: 'web',
    agentType: 'trading-agent',
    rawMessages: [],
    meta: new Map(),
}

describe('collectSystemPrompts', () => {
    test('concatenates static prompts in plugin order', async () => {
        const plugins: AIPlugin[] = [
            { name: 'a', systemPrompt: 'Hello from A.' },
            { name: 'b', systemPrompt: 'Hello from B.' },
        ]
        const result = await collectSystemPrompts(plugins, baseCtx)
        expect(result).toBe('Hello from A.\n\nHello from B.')
    })

    test('calls dynamic prompt functions with context', async () => {
        const plugins: AIPlugin[] = [
            { name: 'a', systemPrompt: (ctx) => `Symbol: ${ctx.symbol}` },
        ]
        const result = await collectSystemPrompts(plugins, {
            ...baseCtx,
            symbol: 'AAPL',
        })
        expect(result).toBe('Symbol: AAPL')
    })

    test('skips plugins without systemPrompt', async () => {
        const plugins: AIPlugin[] = [
            { name: 'a', systemPrompt: 'Only A.' },
            { name: 'b' },
        ]
        const result = await collectSystemPrompts(plugins, baseCtx)
        expect(result).toBe('Only A.')
    })

    test('returns empty string when no plugins provide prompts', async () => {
        const result = await collectSystemPrompts([{ name: 'a' }], baseCtx)
        expect(result).toBe('')
    })
})

describe('collectTools', () => {
    test('merges tools from multiple plugins', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'a',
                tools: { toolA: { tool: {} as Record<string, never> } },
            },
            {
                name: 'b',
                tools: { toolB: { tool: {} as Record<string, never> } },
            },
        ]
        const result = await collectTools(plugins, baseCtx)
        expect(Object.keys(result)).toEqual(['toolA', 'toolB'])
    })

    test('throws ToolConflictError on duplicate tool names', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'a',
                tools: { getQuote: { tool: {} as Record<string, never> } },
            },
            {
                name: 'b',
                tools: { getQuote: { tool: {} as Record<string, never> } },
            },
        ]
        expect(collectTools(plugins, baseCtx)).rejects.toBeInstanceOf(
            ToolConflictError,
        )
    })

    test('supports dynamic tool functions', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'a',
                tools: async () => ({
                    dynamic: { tool: {} as Record<string, never> },
                }),
            },
        ]
        const result = await collectTools(plugins, baseCtx)
        expect(Object.keys(result)).toEqual(['dynamic'])
    })

    test('skips plugins without tools', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'a',
                tools: { toolA: { tool: {} as Record<string, never> } },
            },
            { name: 'b' },
        ]
        const result = await collectTools(plugins, baseCtx)
        expect(Object.keys(result)).toEqual(['toolA'])
    })
})

describe('runTransformChain', () => {
    test('applies transforms in plugin order', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'a',
                transformParams: (_ctx, p) => ({ ...p, maxSteps: 50 }),
            },
            {
                name: 'b',
                transformParams: (_ctx, p) => ({ ...p, temperature: 0.7 }),
            },
        ]
        const initial: ChatParams = { maxSteps: 20 }
        const result = await runTransformChain(
            plugins,
            'transformParams',
            baseCtx,
            initial,
        )
        expect(result).toEqual({ maxSteps: 50, temperature: 0.7 })
    })

    test('skips plugins without the hook', async () => {
        const plugins: AIPlugin[] = [
            { name: 'a' },
            {
                name: 'b',
                transformParams: (_ctx, p) => ({ ...p, maxSteps: 99 }),
            },
        ]
        const initial: ChatParams = { maxSteps: 20 }
        const result = await runTransformChain(
            plugins,
            'transformParams',
            baseCtx,
            initial,
        )
        expect(result).toEqual({ maxSteps: 99 })
    })

    test('propagates errors as PluginError', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'bad',
                transformParams: () => {
                    throw new Error('boom')
                },
            },
        ]
        const initial: ChatParams = { maxSteps: 20 }
        expect(
            runTransformChain(plugins, 'transformParams', baseCtx, initial),
        ).rejects.toThrow('Plugin "bad" failed in hook "transformParams"')
    })
})

describe('runAfterChatHooks', () => {
    test('calls all hooks in parallel', async () => {
        const order: string[] = []
        const plugins: AIPlugin[] = [
            {
                name: 'a',
                afterChat: async () => {
                    order.push('a')
                },
            },
            {
                name: 'b',
                afterChat: async () => {
                    order.push('b')
                },
            },
        ]
        const ctx = {
            ...baseCtx,
            result: {
                text: '',
                usage: { promptTokens: 0, completionTokens: 0 },
                toolCalls: [],
            },
            responseMessage: {} as AfterChatContext['responseMessage'],
            toolCalls: [],
        } as AfterChatContext
        await runAfterChatHooks(plugins, ctx)
        expect(order).toContain('a')
        expect(order).toContain('b')
    })

    test('does not throw when a hook fails', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'bad',
                afterChat: async () => {
                    throw new Error('fail')
                },
            },
            { name: 'good', afterChat: async () => {} },
        ]
        const ctx = {
            ...baseCtx,
            result: {
                text: '',
                usage: { promptTokens: 0, completionTokens: 0 },
                toolCalls: [],
            },
            responseMessage: {} as AfterChatContext['responseMessage'],
            toolCalls: [],
        } as AfterChatContext
        await runAfterChatHooks(plugins, ctx)
    })
})
