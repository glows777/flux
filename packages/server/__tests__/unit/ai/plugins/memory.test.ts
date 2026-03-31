import { describe, expect, test, mock } from 'bun:test'
import { memoryPlugin } from '../../../../src/core/ai/plugins/memory'
import type { HookContext, AfterChatContext } from '../../../../src/core/ai/runtime/types'

describe('memoryPlugin', () => {
  test('has name "memory"', () => {
    const plugin = memoryPlugin()
    expect(plugin.name).toBe('memory')
  })

  test('provides memory tools via tools hook', async () => {
    const mockCreate = mock(() => ({
      memory_read: {}, memory_write: {}, memory_append: {},
      memory_search: {}, memory_list: {},
    }))
    const plugin = memoryPlugin({ deps: { createMemoryTools: mockCreate, processTranscript: mock(() => Promise.resolve()) } })
    const ctx: HookContext = { sessionId: 's1', channel: 'web', agentType: 'trading-agent', rawMessages: [], meta: new Map() }
    const tools = typeof plugin.tools === 'function' ? await plugin.tools(ctx) : plugin.tools!
    expect(Object.keys(tools)).toHaveLength(5)
    expect(Object.keys(tools)).toContain('memory_read')
  })

  test('does NOT provide systemPrompt', () => {
    const plugin = memoryPlugin({ deps: { createMemoryTools: mock(() => ({})), processTranscript: mock(() => Promise.resolve()) } })
    expect(plugin.systemPrompt).toBeUndefined()
  })

  test('afterChat processes transcript by default', async () => {
    const mockProcess = mock(() => Promise.resolve())
    const plugin = memoryPlugin({ deps: { createMemoryTools: mock(() => ({})), processTranscript: mockProcess } })
    const ctx: AfterChatContext = {
      sessionId: 's1', channel: 'web', agentType: 'trading-agent', rawMessages: [], meta: new Map(),
      result: { text: '', usage: { promptTokens: 0, completionTokens: 0 }, toolCalls: [] },
      responseMessage: {} as any, toolCalls: [],
    }
    await plugin.afterChat!(ctx)
    expect(mockProcess).toHaveBeenCalled()
  })

  test('afterChat skips transcript when withTranscript=false', async () => {
    const mockProcess = mock(() => Promise.resolve())
    const plugin = memoryPlugin({ withTranscript: false, deps: { createMemoryTools: mock(() => ({})), processTranscript: mockProcess } })
    const ctx: AfterChatContext = {
      sessionId: 's1', channel: 'web', agentType: 'trading-agent', rawMessages: [], meta: new Map(),
      result: { text: '', usage: { promptTokens: 0, completionTokens: 0 }, toolCalls: [] },
      responseMessage: {} as any, toolCalls: [],
    }
    await plugin.afterChat!(ctx)
    expect(mockProcess).not.toHaveBeenCalled()
  })

  test('afterChat skips transcript when skipTranscript=true', async () => {
    const mockProcess = mock(() => Promise.resolve())
    const plugin = memoryPlugin({ skipTranscript: true, deps: { createMemoryTools: mock(() => ({})), processTranscript: mockProcess } })
    const ctx: AfterChatContext = {
      sessionId: 's1', channel: 'web', agentType: 'trading-agent', rawMessages: [], meta: new Map(),
      result: { text: '', usage: { promptTokens: 0, completionTokens: 0 }, toolCalls: [] },
      responseMessage: {} as any, toolCalls: [],
    }
    await plugin.afterChat!(ctx)
    expect(mockProcess).not.toHaveBeenCalled()
  })
})
