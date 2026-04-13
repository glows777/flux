import { describe, expect, test, mock } from 'bun:test'
import { Gateway } from '../../../src/gateway/gateway'
import type { GatewayInput } from '../../../src/gateway/router'
import type { ChatOutput } from '../../../src/core/ai/runtime/types'
import type { ChannelAdapter } from '../../../src/channels/types'

function makeMockRouter(overrides?: Partial<{ chat: any; clearSession: any }>) {
  return {
    chat: overrides?.chat ?? mock(() => Promise.resolve(makeMockChatOutput())),
    clearSession: overrides?.clearSession ?? mock(() => Promise.resolve({ id: 'session-1' })),
  }
}

function makeMockChatOutput(text = 'AI response'): ChatOutput {
  return {
    streamResult: {} as any,
    sessionId: 'session-123',
    consumeStream: mock(() => Promise.resolve({
      text,
      responseMessage: { id: 'msg-1', role: 'assistant' as const, parts: [] },
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 20 },
    })),
    finalize: mock(() => Promise.resolve()),
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
    const router = makeMockRouter({ chat: mock(() => Promise.resolve(chatOutput)) })
    const gateway = new Gateway({ router: router as any, channels: new Map() })

    const input: GatewayInput = {
      channel: 'web',
      mode: 'conversation',
      messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }] as any,
    }

    const result = await gateway.chat(input)
    expect(result).toBe(chatOutput)
    expect(router.chat).toHaveBeenCalledWith(input)
  })

  test('trigger mode consumes stream and returns TriggerResult', async () => {
    const chatOutput = makeMockChatOutput('trigger response')
    const router = makeMockRouter({ chat: mock(() => Promise.resolve(chatOutput)) })
    const gateway = new Gateway({ router: router as any, channels: new Map() })

    const input: GatewayInput = {
      channel: 'cron',
      mode: 'trigger',
      content: 'run analysis',
    }

    const result = await gateway.chat(input)
    expect(result).toEqual({ text: 'trigger response', sessionId: 'session-123', success: true })
    expect(chatOutput.consumeStream).toHaveBeenCalled()
  })

  test('trigger mode with channelTarget calls adapter.send()', async () => {
    const chatOutput = makeMockChatOutput('notify this')
    const router = makeMockRouter({ chat: mock(() => Promise.resolve(chatOutput)) })
    const adapter = makeMockAdapter()
    const channels = new Map<string, ChannelAdapter>([['discord', adapter]])
    const gateway = new Gateway({ router: router as any, channels })

    const input: GatewayInput = {
      channel: 'cron',
      mode: 'trigger',
      content: 'run analysis',
      channelTarget: { type: 'discord', channelId: 'ch-123' },
    }

    const result = await gateway.chat(input)
    expect(result).toEqual({ text: 'notify this', sessionId: 'session-123', success: true })
    expect(adapter.send).toHaveBeenCalledWith(
      { channelId: 'ch-123' },
      { content: 'notify this' },
    )
  })

  test('trigger mode without channelTarget does not call adapter.send()', async () => {
    const chatOutput = makeMockChatOutput('no push')
    const router = makeMockRouter({ chat: mock(() => Promise.resolve(chatOutput)) })
    const adapter = makeMockAdapter()
    const channels = new Map<string, ChannelAdapter>([['discord', adapter]])
    const gateway = new Gateway({ router: router as any, channels })

    const input: GatewayInput = {
      channel: 'cron',
      mode: 'trigger',
      content: 'run analysis',
    }

    await gateway.chat(input)
    expect(adapter.send).not.toHaveBeenCalled()
  })

  test('trigger mode adapter.send() failure is silent', async () => {
    const chatOutput = makeMockChatOutput('will fail push')
    const router = makeMockRouter({ chat: mock(() => Promise.resolve(chatOutput)) })
    const adapter = makeMockAdapter({
      send: mock(() => Promise.reject(new Error('network error'))),
    })
    const channels = new Map<string, ChannelAdapter>([['discord', adapter]])
    const gateway = new Gateway({ router: router as any, channels })

    const input: GatewayInput = {
      channel: 'cron',
      mode: 'trigger',
      content: 'run analysis',
      channelTarget: { type: 'discord', channelId: 'ch-123' },
    }

    const result = await gateway.chat(input)
    expect(result).toEqual({ text: 'will fail push', sessionId: 'session-123', success: true })
  })

  test('trigger mode AI failure returns success: false', async () => {
    const router = makeMockRouter({
      chat: mock(() => Promise.reject(new Error('AI service down'))),
    })
    const gateway = new Gateway({ router: router as any, channels: new Map() })

    const input: GatewayInput = {
      channel: 'cron',
      mode: 'trigger',
      content: 'run analysis',
    }

    const result = await gateway.chat(input)
    expect(result).toEqual({ text: '', sessionId: '', success: false, error: 'AI service down' })
  })

  test('clearSession delegates to router', async () => {
    const router = makeMockRouter()
    const gateway = new Gateway({ router: router as any, channels: new Map() })

    const params = { channel: 'discord', sourceId: 'guild:channel', createdBy: 'user-1' }
    const result = await gateway.clearSession(params)
    expect(result).toEqual({ id: 'session-1' })
    expect(router.clearSession).toHaveBeenCalledWith(params)
  })
})
