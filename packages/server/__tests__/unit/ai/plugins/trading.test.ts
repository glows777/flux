import { describe, expect, test, mock } from 'bun:test'
import { tradingPlugin } from '../../../../src/core/ai/plugins/trading'
import type { HookContext, ChatParams } from '../../../../src/core/ai/runtime/types'

describe('tradingPlugin', () => {
  test('has name "trading"', () => {
    expect(tradingPlugin({ deps: { createTradingTools: mock(() => ({})) } }).name).toBe('trading')
  })

  test('transformParams sets maxSteps to 50', async () => {
    const plugin = tradingPlugin({ deps: { createTradingTools: mock(() => ({})) } })
    const ctx: HookContext = { sessionId: 's1', channel: 'cron', agentType: 'trading-agent', rawMessages: [], meta: new Map() }
    const result = await plugin.transformParams!(ctx, { maxSteps: 20 })
    expect(result.maxSteps).toBe(50)
  })

  test('provides systemPrompt with TRADING_SECTION', () => {
    const plugin = tradingPlugin({ deps: { createTradingTools: mock(() => ({})) } })
    expect(plugin.systemPrompt).toBeDefined()
    expect(typeof plugin.systemPrompt).toBe('string')
  })

  test('provides all trading tools', () => {
    const mockCreate = mock(() => ({
      placeOrder: {}, cancelOrder: {}, closePosition: {},
      getPortfolio: {}, getTradeHistory: {},
    }))
    const plugin = tradingPlugin({ deps: { createTradingTools: mockCreate } })
    const tools = plugin.tools as any
    const names = Object.keys(tools)
    expect(names).toContain('placeOrder')
    expect(names).toContain('getPortfolio')
    expect(names).toContain('getTradeHistory')
  })

  test('throws when deps.createTradingTools is not provided', () => {
    expect(() => tradingPlugin()).toThrow('tradingPlugin requires deps.createTradingTools')
  })
})
