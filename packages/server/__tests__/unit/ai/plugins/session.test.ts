import { describe, expect, test, mock } from 'bun:test'
import { sessionPlugin } from '../../../../src/core/ai/plugins/session'
import type { HookContext, AfterChatContext } from '../../../../src/core/ai/runtime/types'
import type { UIMessage } from 'ai'

describe('sessionPlugin', () => {
  test('has name "session"', () => {
    const plugin = sessionPlugin()
    expect(plugin.name).toBe('session')
  })

  test('transformMessages truncates to limit', async () => {
    const plugin = sessionPlugin({ truncateLimit: 3 })
    const msgs = Array.from({ length: 5 }, (_, i) => ({
      id: `${i}`,
      role: 'user',
      content: `msg ${i}`,
      parts: [{ type: 'text', text: `msg ${i}` }],
    })) as UIMessage[]
    const ctx: HookContext = { sessionId: 's1', channel: 'web', agentType: 'trading-agent', rawMessages: msgs, meta: new Map() }
    const result = await plugin.transformMessages!(ctx, msgs)
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('2')
  })

  test('transformMessages uses default limit 20', async () => {
    const plugin = sessionPlugin()
    const msgs = Array.from({ length: 25 }, (_, i) => ({
      id: `${i}`,
      role: 'user',
      content: `msg ${i}`,
      parts: [{ type: 'text', text: `msg ${i}` }],
    })) as UIMessage[]
    const ctx: HookContext = { sessionId: 's1', channel: 'web', agentType: 'trading-agent', rawMessages: msgs, meta: new Map() }
    const result = await plugin.transformMessages!(ctx, msgs)
    expect(result).toHaveLength(20)
  })

  test('afterChat persists response message', async () => {
    const mockAppend = mock(() => Promise.resolve())
    const mockTouch = mock(() => Promise.resolve())
    const plugin = sessionPlugin({
      deps: { appendMessage: mockAppend, touchSession: mockTouch },
    })
    const ctx: AfterChatContext = {
      sessionId: 's1', channel: 'web', agentType: 'trading-agent', rawMessages: [], meta: new Map(),
      result: { text: 'hi', usage: { inputTokens: 0, outputTokens: 0 }, toolCalls: [] },
      responseMessage: { id: 'msg-1', role: 'assistant', content: 'hi', parts: [] } as any,
      toolCalls: [],
    }
    await plugin.afterChat!(ctx)
    expect(mockAppend).toHaveBeenCalledWith('s1', ctx.responseMessage)
    expect(mockTouch).toHaveBeenCalledWith('s1')
  })

  test('beforeChat creates session when sessionId is empty', async () => {
    const mockCreate = mock(() => Promise.resolve('new-session-id'))
    const mockAppend = mock(() => Promise.resolve())
    const plugin = sessionPlugin({
      deps: { createSession: mockCreate, appendMessage: mockAppend, touchSession: mock(() => Promise.resolve()) },
    })
    const ctx: HookContext = {
      sessionId: '',
      channel: 'web',
      agentType: 'trading-agent',
      rawMessages: [{ id: '1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }] }] as UIMessage[],
      meta: new Map(),
    }
    await plugin.beforeChat!(ctx)
    expect(mockCreate).toHaveBeenCalled()
    expect(ctx.meta.get('sessionId')).toBe('new-session-id')
  })

  test('beforeChat skips session creation when sessionId exists', async () => {
    const mockCreate = mock(() => Promise.resolve('should-not-be-called'))
    const mockAppend = mock(() => Promise.resolve())
    const plugin = sessionPlugin({
      deps: { createSession: mockCreate, appendMessage: mockAppend, touchSession: mock(() => Promise.resolve()) },
    })
    const ctx: HookContext = {
      sessionId: 'existing-session',
      channel: 'web',
      agentType: 'trading-agent',
      rawMessages: [{ id: '1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }] }] as UIMessage[],
      meta: new Map(),
    }
    await plugin.beforeChat!(ctx)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(ctx.meta.get('sessionId')).toBe('existing-session')
  })

  test('beforeChat persists last user message', async () => {
    const mockAppend = mock(() => Promise.resolve())
    const plugin = sessionPlugin({
      deps: { createSession: mock(() => Promise.resolve('s1')), appendMessage: mockAppend, touchSession: mock(() => Promise.resolve()) },
    })
    const userMsg = { id: '1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }] } as UIMessage
    const ctx: HookContext = {
      sessionId: 'existing',
      channel: 'web',
      agentType: 'trading-agent',
      rawMessages: [userMsg],
      meta: new Map(),
    }
    await plugin.beforeChat!(ctx)
    expect(mockAppend).toHaveBeenCalledWith('existing', userMsg)
  })
})
