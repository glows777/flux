import { describe, expect, it } from 'bun:test'
import { TOOL_CATEGORIES } from '@/core/ai/memory/types'

describe('TOOL_CATEGORIES.TRADING', () => {
  it('contains all trading tool names', () => {
    expect(TOOL_CATEGORIES.TRADING.has('placeOrder')).toBe(true)
    expect(TOOL_CATEGORIES.TRADING.has('cancelOrder')).toBe(true)
    expect(TOOL_CATEGORIES.TRADING.has('closePosition')).toBe(true)
    expect(TOOL_CATEGORIES.TRADING.has('getPortfolio')).toBe(true)
    expect(TOOL_CATEGORIES.TRADING.has('getTradeHistory')).toBe(true)
  })

  it('does not contain non-trading tools', () => {
    expect(TOOL_CATEGORIES.TRADING.has('memory_read')).toBe(false)
    expect(TOOL_CATEGORIES.TRADING.has('getQuote')).toBe(false)
  })
})
