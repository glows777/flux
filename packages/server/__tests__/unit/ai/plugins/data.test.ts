import { describe, expect, test, mock } from 'bun:test'
import { dataPlugin } from '../../../../src/core/ai/plugins/data'

describe('dataPlugin', () => {
  test('has name "data"', () => {
    expect(dataPlugin({ deps: { createTools: mock(() => ({})) } }).name).toBe('data')
  })

  test('provides 6 data tools by default (excluding display tools)', () => {
    const mockCreate = mock(() => ({
      getQuote: {}, getCompanyInfo: {}, getHistory: {},
      calculateIndicators: {}, getReport: {}, searchStock: {},
      display_rating_card: {}, display_comparison_table: {}, display_signal_badges: {},
    }))
    const plugin = dataPlugin({ deps: { createTools: mockCreate } })
    const tools = plugin.tools as any
    const names = Object.keys(tools)
    expect(names).toHaveLength(6)
    expect(names).toContain('getQuote')
    expect(names).not.toContain('display_rating_card')
  })

  test('throws when deps.createTools is not provided', () => {
    expect(() => dataPlugin()).toThrow('dataPlugin requires deps.createTools')
  })
})
