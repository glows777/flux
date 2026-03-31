import { describe, expect, test, mock } from 'bun:test'
import { GatewayRouter } from '@/gateway/router'
import type { GatewayInput } from '@/gateway/router'
import type { AIRuntime, ChatOutput, AgentType } from '@/core/ai/runtime/types'

function createMockRuntime(): AIRuntime {
    const mockConsumeStream = mock(() => Promise.resolve({
        text: 'Hello from AI',
        responseMessage: {
            id: 'resp-1',
            role: 'assistant' as const,
            parts: [{ type: 'text' as const, text: 'Hello from AI' }],
        },
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 50 },
    }))

    return {
        chat: mock(() => Promise.resolve({
            streamResult: {
                text: Promise.resolve('Hello from AI'),
                usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
                steps: Promise.resolve([]),
                toUIMessageStreamResponse: () => new Response('mock stream'),
                toUIMessageStream: () => new ReadableStream(),
            },
            sessionId: 'session-1',
            consumeStream: mockConsumeStream,
            finalize: mock(() => Promise.resolve()),
        } as ChatOutput)),
        getToolDisplayMap: mock(() => ({})),
        dispose: mock(() => Promise.resolve()),
    }
}

describe('GatewayRouter', () => {
    test('chat delegates to correct runtime based on agentType', async () => {
        const tradingRuntime = createMockRuntime()
        const autoTradingRuntime = createMockRuntime()

        const router = new GatewayRouter({
            runtimes: {
                'trading-agent': tradingRuntime,
                'auto-trading-agent': autoTradingRuntime,
            },
        })

        const input: GatewayInput = {
            channel: 'discord',
            agentType: 'trading-agent',
            content: 'What is NVDA price?',
            channelId: 'guild123:channel456',
            userId: 'user789',
        }

        await router.chat(input)
        expect(tradingRuntime.chat).toHaveBeenCalledTimes(1)
        expect(autoTradingRuntime.chat).not.toHaveBeenCalled()
    })

    test('chat defaults to trading-agent when no agentType specified', async () => {
        const tradingRuntime = createMockRuntime()
        const autoTradingRuntime = createMockRuntime()

        const router = new GatewayRouter({
            runtimes: {
                'trading-agent': tradingRuntime,
                'auto-trading-agent': autoTradingRuntime,
            },
        })

        const input: GatewayInput = {
            channel: 'web',
            content: 'Hello',
        }

        await router.chat(input)
        expect(tradingRuntime.chat).toHaveBeenCalledTimes(1)
    })

    test('chat throws for unknown agent type', async () => {
        const router = new GatewayRouter({
            runtimes: {
                'trading-agent': createMockRuntime(),
                'auto-trading-agent': createMockRuntime(),
            },
        })

        const input: GatewayInput = {
            channel: 'web',
            agentType: 'unknown-agent' as AgentType,
            content: 'Hello',
        }

        await expect(router.chat(input)).rejects.toThrow('Unknown agent type')
    })

    test('chat passes through all input fields to runtime', async () => {
        const tradingRuntime = createMockRuntime()

        const router = new GatewayRouter({
            runtimes: {
                'trading-agent': tradingRuntime,
                'auto-trading-agent': createMockRuntime(),
            },
        })

        await router.chat({
            channel: 'discord',
            agentType: 'trading-agent',
            content: 'Check NVDA',
            channelId: 'guild:ch',
            userId: 'user-1',
            symbol: 'NVDA',
        })

        const callArgs = (tradingRuntime.chat as any).mock.calls[0][0]
        expect(callArgs.channel).toBe('discord')
        expect(callArgs.agentType).toBe('trading-agent')
        expect(callArgs.channelId).toBe('guild:ch')
        expect(callArgs.userId).toBe('user-1')
        expect(callArgs.symbol).toBe('NVDA')
    })

    test('chat returns ChatOutput from runtime', async () => {
        const tradingRuntime = createMockRuntime()

        const router = new GatewayRouter({
            runtimes: {
                'trading-agent': tradingRuntime,
                'auto-trading-agent': createMockRuntime(),
            },
        })

        const output = await router.chat({
            channel: 'web',
            content: 'Hello',
        })

        expect(output).toHaveProperty('streamResult')
        expect(output).toHaveProperty('sessionId')
        expect(output).toHaveProperty('consumeStream')
        expect(output).toHaveProperty('finalize')
    })
})

describe('GatewayRouter.clearSession', () => {
    test('proxies to clearChannelSession with correct params', async () => {
        const mockClearFn = mock(() => Promise.resolve({ id: 'new-session-1' }))
        mock.module('@/core/ai/session', () => ({
            clearChannelSession: mockClearFn,
        }))

        // Re-import to pick up the mock
        const { GatewayRouter: MockedRouter } = await import('@/gateway/router')

        const router = new MockedRouter({
            runtimes: {
                'trading-agent': createMockRuntime(),
                'auto-trading-agent': createMockRuntime(),
            },
        })

        const result = await router.clearSession({
            channel: 'discord',
            channelSessionId: 'guild-1:channel-1',
            channelUserId: 'user-1',
        })

        expect(result.id).toBe('new-session-1')
        expect(mockClearFn).toHaveBeenCalledWith({
            channel: 'discord',
            channelSessionId: 'guild-1:channel-1',
            channelUserId: 'user-1',
        })
    })
})
