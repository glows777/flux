import { describe, expect, test } from 'bun:test'
import { InvalidPluginOutputError } from '../../../../src/core/ai/runtime/errors'
import {
    collectPluginOutputs,
    runAfterRunHooks,
    runBeforeRunHooks,
    runOnErrorHooks,
} from '../../../../src/core/ai/runtime/execute'
import type {
    AfterRunContext,
    AIPlugin,
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

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    const promise = new Promise<T>((res, _rej) => {
        resolve = res
    })

    return { promise, resolve }
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

    test('runs contribute() calls in parallel while preserving output order', async () => {
        const first = createDeferred<void>()
        const started: string[] = []

        const outputsPromise = collectPluginOutputs(
            [
                {
                    name: 'first',
                    contribute: async () => {
                        started.push('first')
                        await first.promise
                        return {
                            segments: [
                                {
                                    id: 'first',
                                    target: 'system',
                                    kind: 'system.base',
                                    payload: {
                                        format: 'text',
                                        text: 'first',
                                    },
                                    source: { plugin: 'first' },
                                    priority: 'high',
                                    cacheability: 'stable',
                                    compactability: 'preserve',
                                },
                            ],
                        }
                    },
                },
                {
                    name: 'second',
                    contribute: async () => {
                        started.push('second')
                        return {
                            segments: [
                                {
                                    id: 'second',
                                    target: 'system',
                                    kind: 'system.base',
                                    payload: {
                                        format: 'text',
                                        text: 'second',
                                    },
                                    source: { plugin: 'second' },
                                    priority: 'high',
                                    cacheability: 'stable',
                                    compactability: 'preserve',
                                },
                            ],
                        }
                    },
                },
            ],
            baseCtx,
        )

        await Promise.resolve()
        expect(started).toEqual(['first', 'second'])

        first.resolve()

        await expect(outputsPromise).resolves.toEqual([
            expect.objectContaining({
                plugin: 'first',
                output: expect.objectContaining({
                    segments: [expect.objectContaining({ id: 'first' })],
                }),
            }),
            expect.objectContaining({
                plugin: 'second',
                output: expect.objectContaining({
                    segments: [expect.objectContaining({ id: 'second' })],
                }),
            }),
        ])
    })

    test('rejects nullish and non-object contribute() outputs', async () => {
        const cases = [undefined, null, 42, 'bad', []] as const

        for (const output of cases) {
            const plugins: AIPlugin[] = [
                {
                    name: 'bad',
                    contribute: () => output as never,
                },
            ]

            await expect(
                collectPluginOutputs(plugins, baseCtx),
            ).rejects.toBeInstanceOf(InvalidPluginOutputError)
        }
    })

    test('rejects malformed nested segment shapes', async () => {
        const cases = [
            {
                output: {
                    segments: [
                        {
                            target: 'system',
                            kind: 'system.base',
                            payload: {
                                format: 'text',
                                text: 'ok',
                            },
                            source: { plugin: 'prompt' },
                            priority: 'high',
                            cacheability: 'stable',
                            compactability: 'preserve',
                        },
                    ],
                },
                reason: 'segments[0].id must be a string',
            },
            {
                output: {
                    segments: [
                        {
                            id: 'bad',
                            target: 'system',
                            kind: 'system.base',
                            payload: {
                                format: 'text',
                                text: 123,
                            },
                            source: { plugin: 'prompt' },
                            priority: 'high',
                            cacheability: 'stable',
                            compactability: 'preserve',
                        },
                    ],
                },
                reason: 'segments[0].payload.text must be a string',
            },
            {
                output: {
                    segments: [
                        {
                            id: 'bad',
                            target: 'messages',
                            kind: 'history.recent',
                            payload: {
                                format: 'messages',
                                messages: {},
                            },
                            source: { plugin: 'prompt' },
                            priority: 'low',
                            cacheability: 'session',
                            compactability: 'trim',
                        },
                    ],
                },
                reason: 'segments[0].payload.messages must be an array',
            },
            {
                output: {
                    segments: [
                        {
                            id: 'bad',
                            target: 'messages',
                            kind: 'history.recent',
                            payload: {
                                format: 'messages',
                                messages: [
                                    {
                                        role: 'user',
                                        parts: [],
                                    },
                                ],
                            },
                            source: { plugin: 'prompt' },
                            priority: 'low',
                            cacheability: 'session',
                            compactability: 'trim',
                        },
                    ],
                },
                reason: 'segments[0].payload.messages[0].id must be a string',
            },
            {
                output: {
                    segments: [
                        {
                            id: 'bad',
                            target: 'messages',
                            kind: 'history.recent',
                            payload: {
                                format: 'messages',
                                messages: [
                                    {
                                        id: 'm1',
                                        role: 'user',
                                        parts: [null],
                                    },
                                ],
                            },
                            source: { plugin: 'prompt' },
                            priority: 'low',
                            cacheability: 'session',
                            compactability: 'trim',
                        },
                    ],
                },
                reason: 'segments[0].payload.messages[0].parts[0] must be an object',
            },
        ] as const

        for (const { output, reason } of cases) {
            const plugins: AIPlugin[] = [
                {
                    name: 'bad',
                    contribute: () => output as never,
                },
            ]

            await expect(
                collectPluginOutputs(plugins, baseCtx),
            ).rejects.toThrow(reason)
        }
    })

    test('rejects malformed nested tool shapes', async () => {
        const cases = [
            {
                output: {
                    tools: [
                        {
                            definition: {
                                tool: {},
                            },
                            source: 'prompt',
                            manifestSpec: {},
                        },
                    ],
                },
                reason: 'tools[0].name must be a string',
            },
            {
                output: {
                    tools: [
                        {
                            name: 'quote',
                            definition: {},
                            source: 'prompt',
                            manifestSpec: {},
                        },
                    ],
                },
                reason: 'tools[0].definition.tool must be an object',
            },
            {
                output: {
                    tools: [
                        {
                            name: 'quote',
                            definition: {
                                tool: {},
                            },
                            source: 123,
                            manifestSpec: {},
                        },
                    ],
                },
                reason: 'tools[0].source must be a string',
            },
            {
                output: {
                    tools: [
                        {
                            name: 'quote',
                            definition: {
                                tool: {},
                            },
                            source: 'prompt',
                            manifestSpec: {
                                description: 123,
                            },
                        },
                    ],
                },
                reason: 'tools[0].manifestSpec.description must be a string',
            },
        ] as const

        for (const { output, reason } of cases) {
            const plugins: AIPlugin[] = [
                {
                    name: 'bad',
                    contribute: () => output as never,
                },
            ]

            await expect(
                collectPluginOutputs(plugins, baseCtx),
            ).rejects.toThrow(reason)
        }
    })

    test('rejects malformed params values and types', async () => {
        const cases = [
            {
                output: { params: { maxSteps: 'fast' } },
                reason: 'params.maxSteps must be a number',
            },
            {
                output: { params: { temperature: Number.NaN } },
                reason: 'params.temperature must be a finite number',
            },
            {
                output: { params: { thinkingBudget: {} } },
                reason: 'params.thinkingBudget must be a number',
            },
            {
                output: { params: { maxSteps: 0 } },
                reason: 'params.maxSteps must be a positive integer',
            },
            {
                output: { params: { maxTokens: 1.5 } },
                reason: 'params.maxTokens must be a positive integer',
            },
            {
                output: { params: { thinkingBudget: -1 } },
                reason: 'params.thinkingBudget must be a positive integer',
            },
        ] as const

        for (const { output, reason } of cases) {
            const plugins: AIPlugin[] = [
                {
                    name: 'bad',
                    contribute: () => output as never,
                },
            ]

            await expect(
                collectPluginOutputs(plugins, baseCtx),
            ).rejects.toThrow(reason)
        }
    })

    test('rejects malformed diagnostics fields and types', async () => {
        const cases = [
            {
                output: {
                    diagnostics: [
                        {
                            level: 'info',
                            message: 'ok',
                        },
                    ],
                },
                reason: 'diagnostics[0].plugin must be a string',
            },
            {
                output: {
                    diagnostics: [
                        {
                            plugin: 'prompt',
                            level: 'verbose',
                            message: 'ok',
                        },
                    ],
                },
                reason: 'diagnostics[0].level must be one of debug, info, warn, error',
            },
            {
                output: {
                    diagnostics: [
                        {
                            plugin: 'prompt',
                            level: 'info',
                            message: 123,
                        },
                    ],
                },
                reason: 'diagnostics[0].message must be a string',
            },
        ] as const

        for (const { output, reason } of cases) {
            const plugins: AIPlugin[] = [
                {
                    name: 'bad',
                    contribute: () => output as never,
                },
            ]

            await expect(
                collectPluginOutputs(plugins, baseCtx),
            ).rejects.toThrow(reason)
        }
    })

    test('rejects invalid container shapes', async () => {
        const cases = [
            {
                output: { toolz: [] },
                reason: 'output.toolz is not supported',
            },
            {
                output: { segments: {} },
                reason: 'segments must be an array',
            },
            {
                output: { tools: {} },
                reason: 'tools must be an array',
            },
            {
                output: { params: [] },
                reason: 'params must be an object',
            },
            {
                output: { diagnostics: {} },
                reason: 'diagnostics must be an array',
            },
            {
                output: { segments: [null] },
                reason: 'segments[0] must be an object',
            },
            {
                output: { tools: [null] },
                reason: 'tools[0] must be an object',
            },
            {
                output: { diagnostics: [null] },
                reason: 'diagnostics[0] must be an object',
            },
        ] as const

        for (const { output, reason } of cases) {
            const plugins: AIPlugin[] = [
                {
                    name: 'bad',
                    contribute: () => output as never,
                },
            ]

            await expect(
                collectPluginOutputs(plugins, baseCtx),
            ).rejects.toThrow(reason)
        }
    })

    test('skips plugins without contribute()', async () => {
        const outputs = await collectPluginOutputs([{ name: 'a' }], baseCtx)
        expect(outputs).toEqual([])
    })

    test('fails fast when a later plugin throws and an earlier plugin hangs', async () => {
        const plugins: AIPlugin[] = [
            {
                name: 'first',
                contribute: async () => {
                    await createDeferred<void>().promise
                    return {
                        segments: [],
                    }
                },
            },
            {
                name: 'second',
                contribute: () => {
                    throw new Error('second boom')
                },
            },
        ]

        await expect(collectPluginOutputs(plugins, baseCtx)).rejects.toThrow(
            'Plugin "second" failed in hook "contribute"',
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
