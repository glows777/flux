import { describe, expect, mock, test } from 'bun:test'
import type { UIMessage } from 'ai'
import { sessionPlugin } from '../../../../src/core/ai/plugins/session'
import type {
    AfterRunContext,
    RunContext,
} from '../../../../src/core/ai/runtime/types'

function makeUserMessage(id: string, text: string): UIMessage {
    return {
        id,
        role: 'user',
        parts: [{ type: 'text', text }],
    } as UIMessage
}

function makeRunContext(overrides: Partial<RunContext> = {}): RunContext {
    return {
        sessionId: 's1',
        channel: 'web',
        mode: 'conversation',
        agentType: 'trading-agent',
        rawMessages: [],
        meta: new Map(),
        ...overrides,
    }
}

function makeAfterRunContext(
    overrides: Partial<AfterRunContext> = {},
): AfterRunContext {
    return {
        ...makeRunContext(),
        text: 'hi',
        responseMessage: {
            id: 'assistant-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'hi' }],
        } as UIMessage,
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        contextManifest: {
            runId: 'run-1',
            createdAt: new Date().toISOString(),
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                defaults: {},
            },
            pluginOutputs: [],
            assembledContext: {
                segments: [],
                tools: [],
                params: { candidates: [], resolved: {} },
                totalEstimatedInputTokens: 0,
            },
            modelRequest: {
                systemText: '',
                modelMessages: [],
                toolNames: [],
                resolvedParams: {},
                providerOptions: {},
            },
        },
        ...overrides,
    }
}

function makeDeps(overrides: Record<string, unknown> = {}) {
    return {
        createSession: mock(async () => 'new-session-id'),
        loadMessages: mock(async () => []),
        appendMessage: mock(async () => {}),
        saveMessageManifest: mock(async () => {}),
        touchSession: mock(async () => {}),
        resolveSession: mock(async () => 'resolved-session-id'),
        saveSessionError: mock(async () => {}),
        clearSessionError: mock(async () => {}),
        ...overrides,
    }
}

describe('sessionPlugin', () => {
    test('has name "session"', () => {
        expect(sessionPlugin().name).toBe('session')
    })

    test('contribute returns recent-history message segment for web messages', async () => {
        const plugin = sessionPlugin({ truncateLimit: 3 })
        const msgs = Array.from({ length: 5 }, (_, i) =>
            makeUserMessage(`${i}`, `msg ${i}`),
        )

        const output = await plugin.contribute?.(
            makeRunContext({ rawMessages: msgs }) as never,
        )

        const history = output?.segments?.[0]
        expect(history?.kind).toBe('history.recent')
        if (!history || history.payload.format !== 'messages') {
            throw new Error('Expected history.recent messages payload')
        }
        expect(history.payload.messages).toHaveLength(3)
        expect(history.payload.messages[0].id).toBe('2')
    })

    test('contribute loads db-backed history for sourceId channels', async () => {
        const deps = makeDeps({
            loadMessages: async () => [makeUserMessage('db-1', 'db')],
        })
        const plugin = sessionPlugin({ deps })

        const output = await plugin.contribute?.(
            makeRunContext({
                channel: 'discord',
                rawMessages: [],
                meta: new Map([
                    ['sourceId', 'discord:1'],
                    ['sessionId', 's1'],
                ]),
            }) as never,
        )

        const history = output?.segments?.[0]
        if (!history || history.payload.format !== 'messages') {
            throw new Error('Expected history.recent messages payload')
        }
        expect(history.payload.messages[0].id).toBe('db-1')
    })

    test('beforeRun creates session when sessionId is empty', async () => {
        const deps = makeDeps()
        const plugin = sessionPlugin({ deps })
        const ctx = makeRunContext({
            sessionId: '',
            rawMessages: [makeUserMessage('1', 'hello')],
        })

        await plugin.beforeRun?.(ctx)

        expect(deps.createSession).toHaveBeenCalled()
        expect(ctx.meta.get('sessionId')).toBe('new-session-id')
    })

    test('beforeRun resolves sourceId sessions in conversation mode', async () => {
        const deps = makeDeps()
        const plugin = sessionPlugin({ deps })
        const ctx = makeRunContext({
            sessionId: '',
            channel: 'discord',
            rawMessages: [makeUserMessage('1', 'hello')],
            meta: new Map([
                ['sourceId', 'discord:1'],
                ['userId', 'user-1'],
            ]),
        })

        await plugin.beforeRun?.(ctx)

        expect(deps.resolveSession).toHaveBeenCalledWith({
            channel: 'discord',
            sourceId: 'discord:1',
            createdBy: 'user-1',
            symbol: undefined,
            title: 'hello',
        })
        expect(ctx.meta.get('sessionId')).toBe('resolved-session-id')
    })

    test('trigger mode always creates a fresh session', async () => {
        const deps = makeDeps()
        const plugin = sessionPlugin({ deps })
        const ctx = makeRunContext({
            sessionId: 'existing-session',
            channel: 'cron',
            mode: 'trigger',
            agentType: 'auto-trading-agent',
            rawMessages: [makeUserMessage('1', 'run')],
            meta: new Map([['sourceId', 'cron:job-123']]),
        })

        await plugin.beforeRun?.(ctx)

        expect(deps.createSession).toHaveBeenCalled()
        expect(deps.resolveSession).not.toHaveBeenCalled()
        expect(ctx.meta.get('sessionId')).toBe('new-session-id')
    })

    test('beforeRun persists the last user message and clears prior error', async () => {
        const deps = makeDeps()
        const plugin = sessionPlugin({ deps })
        const userMsg = makeUserMessage('2', 'latest')
        const ctx = makeRunContext({
            rawMessages: [makeUserMessage('1', 'first'), userMsg],
        })

        await plugin.beforeRun?.(ctx)

        expect(deps.appendMessage).toHaveBeenCalledWith('s1', userMsg)
        expect(deps.clearSessionError).toHaveBeenCalledWith('s1')
    })

    test('afterRun persists the assistant response, touches session, and clears error', async () => {
        const deps = makeDeps()
        const plugin = sessionPlugin({ deps })
        const ctx = makeAfterRunContext()

        await plugin.afterRun?.(ctx)

        expect(deps.appendMessage).toHaveBeenCalledWith(
            's1',
            ctx.responseMessage,
        )
        expect(deps.saveMessageManifest).toHaveBeenCalledWith(
            's1',
            'assistant-1',
            ctx.contextManifest,
        )
        expect(deps.touchSession).toHaveBeenCalledWith('s1')
        expect(deps.clearSessionError).toHaveBeenCalledWith('s1')
    })

    test('afterRun continues bookkeeping when manifest persistence fails', async () => {
        const deps = makeDeps({
            saveMessageManifest: mock(async () => {
                throw new Error('manifest write failed')
            }),
        })
        const plugin = sessionPlugin({ deps })
        const ctx = makeAfterRunContext()
        const errorSpy = mock(() => {})
        const originalConsoleError = console.error
        console.error = errorSpy as typeof console.error

        try {
            await plugin.afterRun?.(ctx)
        } finally {
            console.error = originalConsoleError
        }

        expect(deps.touchSession).toHaveBeenCalledWith('s1')
        expect(deps.clearSessionError).toHaveBeenCalledWith('s1')
        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy).toHaveBeenCalledWith(
            'Failed to save message manifest',
            expect.any(Error),
        )
    })

    test('onError persists error with name, message, and code when sessionId resolved', async () => {
        const deps = makeDeps()
        const plugin = sessionPlugin({ deps })
        const error = Object.assign(new Error('rate limited'), {
            name: 'RateLimitError',
            code: 'RATE_LIMIT',
        })
        const ctx = makeRunContext({
            meta: new Map([['sessionId', 's1']]),
        })

        await plugin.onError?.(ctx, error)

        expect(deps.saveSessionError).toHaveBeenCalledWith('s1', {
            message: 'rate limited',
            name: 'RateLimitError',
            code: 'RATE_LIMIT',
        })
    })

    test('onError no-ops when no sessionId is available', async () => {
        const deps = makeDeps()
        const plugin = sessionPlugin({ deps })

        await plugin.onError?.(
            makeRunContext({ sessionId: '', meta: new Map() }),
            new Error('early failure'),
        )

        expect(deps.saveSessionError).not.toHaveBeenCalled()
    })
})
