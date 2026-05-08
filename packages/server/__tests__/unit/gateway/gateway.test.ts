import { describe, expect, mock, test } from 'bun:test'
import type { ChannelAdapter } from '../../../src/channels/types'
import type { ChatOutput } from '../../../src/core/ai/runtime/types'
import { Gateway } from '../../../src/gateway/gateway'
import type { GatewayInput, Router } from '../../../src/gateway/router'

type MockRouter = Pick<Router, 'chat' | 'clearSession'>

function makeMockRouter(overrides?: Partial<MockRouter>): MockRouter {
    return {
        chat:
            overrides?.chat ??
            mock(() => Promise.resolve(makeMockChatOutput())),
        clearSession:
            overrides?.clearSession ??
            mock(() => Promise.resolve({ id: 'session-1' })),
    }
}

function makeContextManifest(
    runId: string,
): ReturnType<ChatOutput['getContextManifest']> {
    return {
        runId,
        createdAt: new Date().toISOString(),
        input: {} as never,
        pluginOutputs: [],
        assembledContext: {} as never,
        modelRequest: {} as never,
    }
}

function makeConsumedResult(
    text: string,
    runId = 'run-123',
): Awaited<ReturnType<ChatOutput['consumeStream']>> {
    return {
        text,
        responseMessage: {
            id: 'msg-1',
            role: 'assistant' as const,
            parts: [],
        },
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 20 },
        contextManifest: makeContextManifest(runId),
    }
}

function makeMockChatOutput(
    text = 'AI response',
    runId = 'run-123',
): ChatOutput {
    return {
        streamResult: {} as ChatOutput['streamResult'],
        runId,
        sessionId: 'session-123',
        consumeStream: mock(() =>
            Promise.resolve(makeConsumedResult(text, runId)),
        ),
        finalize: mock(() => Promise.resolve()),
        recordFailure: mock(() => Promise.resolve()),
        getContextManifest: () => makeContextManifest(runId),
    }
}

function makeMockAdapter(overrides?: Partial<ChannelAdapter>): ChannelAdapter {
    return {
        type: 'discord',
        start: mock(() => Promise.resolve()),
        stop: mock(() => Promise.resolve()),
        send: mock(() => Promise.resolve()),
        ...overrides,
    }
}

describe('Gateway', () => {
    test('conversation mode returns ChatOutput directly', async () => {
        const chatOutput = makeMockChatOutput()
        const router = makeMockRouter({
            chat: mock(() => Promise.resolve(chatOutput)),
        })
        const gateway = new Gateway({
            router: router as unknown as Router,
            channels: new Map(),
        })
        const messages: NonNullable<GatewayInput['messages']> = [
            {
                id: '1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            },
        ]

        const input: GatewayInput = {
            channel: 'web',
            mode: 'conversation',
            messages,
        }

        const result = await gateway.chat(input)
        expect(result).toBe(chatOutput)
        expect(router.chat).toHaveBeenCalledWith(input)
    })

    test('trigger mode consumes stream and returns TriggerResult', async () => {
        const router = makeMockRouter({
            chat: mock((input: GatewayInput) =>
                Promise.resolve(
                    makeMockChatOutput('trigger response', input.runId),
                ),
            ),
        })
        const gateway = new Gateway({
            router: router as unknown as Router,
            channels: new Map(),
        })

        const input: GatewayInput = {
            channel: 'cron',
            mode: 'trigger',
            content: 'run analysis',
        }

        const result = await gateway.chat(input)
        const callArgs = (router.chat as ReturnType<typeof mock>).mock
            .calls[0]?.[0]
        expect(result).toEqual({
            text: 'trigger response',
            sessionId: 'session-123',
            runId: callArgs.runId,
            success: true,
        })
        expect(callArgs.runId).toEqual(expect.any(String))
    })

    test('trigger mode with channelTarget calls adapter.send()', async () => {
        const chatOutput = makeMockChatOutput('notify this', 'run-notify')
        const router = makeMockRouter({
            chat: mock(() => Promise.resolve(chatOutput)),
        })
        const adapter = makeMockAdapter()
        const channels = new Map<string, ChannelAdapter>([['discord', adapter]])
        const gateway = new Gateway({
            router: router as unknown as Router,
            channels,
        })

        const input: GatewayInput = {
            channel: 'cron',
            mode: 'trigger',
            content: 'run analysis',
            runId: 'run-notify',
            channelTarget: { type: 'discord', channelId: 'ch-123' },
        }

        const result = await gateway.chat(input)
        expect(result).toEqual({
            text: 'notify this',
            sessionId: 'session-123',
            runId: 'run-notify',
            success: true,
        })
        expect(adapter.send).toHaveBeenCalledWith(
            { channelId: 'ch-123' },
            { content: 'notify this' },
        )
    })

    test('trigger mode without channelTarget does not call adapter.send()', async () => {
        const chatOutput = makeMockChatOutput('no push')
        const router = makeMockRouter({
            chat: mock(() => Promise.resolve(chatOutput)),
        })
        const adapter = makeMockAdapter()
        const channels = new Map<string, ChannelAdapter>([['discord', adapter]])
        const gateway = new Gateway({
            router: router as unknown as Router,
            channels,
        })

        const input: GatewayInput = {
            channel: 'cron',
            mode: 'trigger',
            content: 'run analysis',
        }

        await gateway.chat(input)
        expect(adapter.send).not.toHaveBeenCalled()
    })

    test('trigger mode adapter.send() failure is silent', async () => {
        const chatOutput = makeMockChatOutput('will fail push', 'run-push-fail')
        const router = makeMockRouter({
            chat: mock(() => Promise.resolve(chatOutput)),
        })
        const adapter = makeMockAdapter({
            send: mock(() => Promise.reject(new Error('network error'))),
        })
        const channels = new Map<string, ChannelAdapter>([['discord', adapter]])
        const gateway = new Gateway({
            router: router as unknown as Router,
            channels,
        })

        const input: GatewayInput = {
            channel: 'cron',
            mode: 'trigger',
            content: 'run analysis',
            runId: 'run-push-fail',
            channelTarget: { type: 'discord', channelId: 'ch-123' },
        }

        const result = await gateway.chat(input)
        expect(result).toEqual({
            text: 'will fail push',
            sessionId: 'session-123',
            runId: 'run-push-fail',
            success: true,
        })
    })

    test('trigger mode skips delivery when aborted after stream consumption', async () => {
        const abortController = new AbortController()
        const chatOutput = makeMockChatOutput('do not send', 'run-abort')
        chatOutput.consumeStream = mock(() => {
            abortController.abort()
            return Promise.resolve(
                makeConsumedResult('do not send', 'run-abort'),
            )
        })
        const router = makeMockRouter({
            chat: mock(() => Promise.resolve(chatOutput)),
        })
        const adapter = makeMockAdapter()
        const gateway = new Gateway({
            router: router as unknown as Router,
            channels: new Map([['discord', adapter]]),
        })

        const result = await gateway.chat({
            channel: 'cron',
            mode: 'trigger',
            content: 'run analysis',
            runId: 'run-abort',
            abortSignal: abortController.signal,
            channelTarget: { type: 'discord', channelId: 'ch-123' },
        })

        expect(result).toEqual({
            text: 'do not send',
            sessionId: 'session-123',
            runId: 'run-abort',
            success: true,
        })
        expect(adapter.send).not.toHaveBeenCalled()
    })

    test('trigger mode AI failure returns success: false', async () => {
        const router = makeMockRouter({
            chat: mock(() => Promise.reject(new Error('AI service down'))),
        })
        const gateway = new Gateway({
            router: router as unknown as Router,
            channels: new Map(),
        })

        const input: GatewayInput = {
            channel: 'cron',
            mode: 'trigger',
            content: 'run analysis',
            runId: 'run-ai-fail',
        }

        const result = await gateway.chat(input)
        expect(result).toEqual({
            text: '',
            sessionId: '',
            runId: 'run-ai-fail',
            success: false,
            error: 'AI service down',
        })
    })

    test('trigger mode AI failure returns input sessionId and runId', async () => {
        const router = makeMockRouter({
            chat: mock(() => Promise.reject(new Error('AI service down'))),
        })
        const gateway = new Gateway({
            router: router as unknown as Router,
            channels: new Map(),
        })

        const input: GatewayInput = {
            channel: 'cron',
            mode: 'trigger',
            content: 'run analysis',
            sessionId: 'session-input',
            runId: 'run-ai-fail',
        }

        const result = await gateway.chat(input)
        expect(result).toEqual({
            text: '',
            sessionId: 'session-input',
            runId: 'run-ai-fail',
            success: false,
            error: 'AI service down',
        })
    })

    test('trigger mode stream failure returns success: false', async () => {
        const chatOutput = makeMockChatOutput('unused', 'run-stream-fail')
        chatOutput.consumeStream = mock(() =>
            Promise.reject(new Error('stream broke')),
        )
        const router = makeMockRouter({
            chat: mock(() => Promise.resolve(chatOutput)),
        })
        const gateway = new Gateway({
            router: router as unknown as Router,
            channels: new Map(),
        })

        const input: GatewayInput = {
            channel: 'cron',
            mode: 'trigger',
            content: 'run analysis',
            runId: 'run-stream-fail',
        }

        const result = await gateway.chat(input)
        expect(result).toEqual({
            text: '',
            sessionId: 'session-123',
            runId: 'run-stream-fail',
            success: false,
            error: 'stream broke',
        })
    })

    test('clearSession delegates to router', async () => {
        const router = makeMockRouter()
        const gateway = new Gateway({
            router: router as unknown as Router,
            channels: new Map(),
        })

        const params = {
            channel: 'discord',
            sourceId: 'guild:channel',
            createdBy: 'user-1',
        }
        const result = await gateway.clearSession(params)
        expect(result).toEqual({ id: 'session-1' })
        expect(router.clearSession).toHaveBeenCalledWith(params)
    })
})
