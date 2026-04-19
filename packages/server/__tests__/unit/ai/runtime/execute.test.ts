import { describe, expect, test } from 'bun:test'
import {
    collectPluginOutputs,
    runAfterRunHooks,
    runBeforeRunHooks,
    runOnErrorHooks,
} from '../../../../src/core/ai/runtime/execute'
import type {
    AIPlugin,
    AfterRunContext,
    RunContext,
} from '../../../../src/core/ai/runtime/types'

const baseCtx: RunContext = {
    sessionId: 'sess-1',
    channel: 'web',
    mode: 'conversation',
    agentType: 'trading-agent',
    rawMessages: [],
    meta: new Map(),
}

describe('runBeforeRunHooks', () => {
    test('runs hooks serially in plugin order', async () => {
        const order: string[] = []
        const plugins: AIPlugin[] = [
            { name: 'a', beforeRun: () => void order.push('a') },
            { name: 'b', beforeRun: () => void order.push('b') },
        ]
        await runBeforeRunHooks(plugins, baseCtx)
        expect(order).toEqual(['a', 'b'])
    })

    test('propagates errors as PluginError', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'bad',
                beforeRun: () => {
                    throw new Error('boom')
                },
            },
        ]
        expect(runBeforeRunHooks(plugins, baseCtx)).rejects.toThrow(
            'Plugin "bad" failed in hook "beforeRun"',
        )
    })
})

describe('collectPluginOutputs', () => {
    test('collectPluginOutputs groups contribute() results by plugin', async () => {
        const outputs = await collectPluginOutputs(
            [
                {
                    name: 'prompt',
                    contribute: () => ({
                        segments: [
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
                    }),
                },
            ],
            baseCtx,
        )

        expect(outputs[0].plugin).toBe('prompt')
        expect(outputs[0].output.segments?.[0].id).toBe('base')
    })

    test('skips plugins without contribute()', async () => {
        const outputs = await collectPluginOutputs([{ name: 'a' }], baseCtx)
        expect(outputs).toEqual([])
    })

    test('propagates contribute() errors as PluginError', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'bad',
                contribute: () => {
                    throw new Error('boom')
                },
            },
        ]
        expect(collectPluginOutputs(plugins, baseCtx)).rejects.toThrow(
            'Plugin "bad" failed in hook "contribute"',
        )
    })
})

describe('runAfterRunHooks', () => {
    test('calls all hooks in parallel', async () => {
        const order: string[] = []
        const plugins: AIPlugin[] = [
            { name: 'a', afterRun: async () => void order.push('a') },
            { name: 'b', afterRun: async () => void order.push('b') },
        ]

        const ctx = {
            ...baseCtx,
            text: '',
            responseMessage: {} as AfterRunContext['responseMessage'],
            toolCalls: [],
            usage: { inputTokens: 0, outputTokens: 0 },
            contextManifest: {} as AfterRunContext['contextManifest'],
        } satisfies AfterRunContext

        await runAfterRunHooks(plugins, ctx)
        expect(order).toContain('a')
        expect(order).toContain('b')
    })

    test('does not throw when a hook fails', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'bad',
                afterRun: async () => {
                    throw new Error('fail')
                },
            },
            { name: 'good', afterRun: async () => {} },
        ]

        const ctx = {
            ...baseCtx,
            text: '',
            responseMessage: {} as AfterRunContext['responseMessage'],
            toolCalls: [],
            usage: { inputTokens: 0, outputTokens: 0 },
            contextManifest: {} as AfterRunContext['contextManifest'],
        } satisfies AfterRunContext

        await runAfterRunHooks(plugins, ctx)
    })
})

describe('runOnErrorHooks', () => {
    test('does not throw when a hook fails', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'bad',
                onError: async () => {
                    throw new Error('fail')
                },
            },
            { name: 'good', onError: async () => {} },
        ]
        await runOnErrorHooks(plugins, baseCtx, new Error('boom'))
    })
})
