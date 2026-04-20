import { describe, expect, test } from 'bun:test'
import type { AIPlugin } from '../../../../src/core/ai/runtime/types'
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
        expect(plugin.contribute).toBeUndefined()
        expect(plugin.beforeRun).toBeUndefined()
    })

    test('AIPlugin with all hooks compiles correctly', () => {
        const plugin: AIPlugin = {
            name: 'full',
            async init() {},
            async destroy() {},
            async beforeRun() {},
            contribute: () => ({
                segments: [
                    {
                        id: 'base',
                        target: 'system',
                        kind: 'system.base',
                        payload: { format: 'text', text: 'test prompt' },
                        source: { plugin: 'full' },
                        priority: 'required',
                        cacheability: 'stable',
                        compactability: 'preserve',
                    },
                ],
                params: { maxSteps: 42 },
            }),
            async afterRun() {},
            async onError() {},
        }

        expect(plugin.name).toBe('full')
    })

    test('AIPlugin can contribute tools dynamically', () => {
        const plugin: AIPlugin = {
            name: 'dynamic',
            contribute: async () => ({
                tools: [
                    {
                        name: 'lookup',
                        definition: { tool: {} as never },
                        source: 'dynamic',
                        manifestSpec: { description: 'lookup something' },
                    },
                ],
            }),
        }

        expect(typeof plugin.contribute).toBe('function')
    })
})
