import { describe, expect, test } from 'bun:test'
import type {
    AIPlugin,
    HookContext,
} from '../../../../src/core/ai/runtime/types'
import { DEFAULT_CHAT_PARAMS } from '../../../../src/core/ai/runtime/types'

describe('runtime types', () => {
    test('DEFAULT_CHAT_PARAMS has correct defaults', () => {
        expect(DEFAULT_CHAT_PARAMS.maxSteps).toBe(20)
        expect(DEFAULT_CHAT_PARAMS.temperature).toBeUndefined()
        expect(DEFAULT_CHAT_PARAMS.thinkingBudget).toBeUndefined()
    })

    test('AIPlugin with only name is valid (minimal plugin)', () => {
        const plugin: AIPlugin = { name: 'test' }
        expect(plugin.name).toBe('test')
        expect(plugin.init).toBeUndefined()
        expect(plugin.tools).toBeUndefined()
        expect(plugin.systemPrompt).toBeUndefined()
    })

    test('AIPlugin with all hooks compiles correctly', () => {
        const plugin: AIPlugin = {
            name: 'full',
            async init() {},
            async destroy() {},
            tools: {},
            systemPrompt: 'test prompt',
            transformMessages: (_ctx, msgs) => msgs,
            transformParams: (_ctx, params) => params,
            afterChat: async () => {},
        }
        expect(plugin.name).toBe('full')
    })

    test('AIPlugin with dynamic tools/prompt compiles correctly', () => {
        const plugin: AIPlugin = {
            name: 'dynamic',
            tools: async (_ctx: HookContext) => ({}),
            systemPrompt: async (_ctx: HookContext) => 'dynamic prompt',
        }
        expect(typeof plugin.tools).toBe('function')
        expect(typeof plugin.systemPrompt).toBe('function')
    })
})
