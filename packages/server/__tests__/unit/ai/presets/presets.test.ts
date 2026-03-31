import { describe, expect, test, mock, beforeAll } from 'bun:test'

// Mock bash-tool so skillPlugin.init() doesn't require real filesystem
mock.module('bash-tool', () => ({
  experimental_createSkillTool: mock(async () => ({
    skill: {},
    files: [],
    instructions: '',
  })),
  createBashTool: mock(async () => ({
    tools: { bash: {}, readFile: {}, writeFile: {} },
  })),
}))

// Mock factories for plugins that require real external deps
const mockToolDeps = {
  getQuote: mock(async () => ({ price: 100, change: 0, changePercent: 0, volume: 0 })),
  getInfo: mock(async () => ({ name: 'Test', symbol: 'TEST' })),
  getHistoryRaw: mock(async () => []),
  getNews: mock(async () => []),
  getReportFromCache: mock(async () => null),
  searchStocks: mock(async () => []),
}

const mockTradingToolDeps = {
  alpacaClient: {} as any,
  db: {
    order: {
      create: mock(async () => ({})),
      findMany: mock(async () => []),
      findUnique: mock(async () => null),
      update: mock(async () => ({})),
    },
  },
  getQuote: mock(async () => ({ price: 100 })),
}

const mockCreateResearchToolsFactory = mock(() => ({
  webSearch: {},
  webFetch: {},
}))

describe('presets', () => {
  test('tradingAgentPreset includes expected plugins', async () => {
    const { tradingAgentPreset } = await import('../../../../src/core/ai/presets/trading-agent')
    expect(typeof tradingAgentPreset).toBe('function')

    const plugins = tradingAgentPreset({
      toolDeps: mockToolDeps,
      tradingToolDeps: mockTradingToolDeps,
      createResearchToolsFactory: mockCreateResearchToolsFactory,
    })
    expect(Array.isArray(plugins)).toBe(true)

    const names = plugins.map((p) => p.name)
    expect(names).toContain('prompt')
    expect(names).toContain('session')
    expect(names).toContain('memory')
    expect(names).toContain('skill')
    expect(names).toContain('data')
    expect(names).toContain('display')
    expect(names).toContain('trading')
    expect(names).toContain('research')
  })

  test('autoTradingAgentPreset includes expected plugins', async () => {
    const { autoTradingAgentPreset } = await import('../../../../src/core/ai/presets/auto-trading-agent')
    expect(typeof autoTradingAgentPreset).toBe('function')
  })

  test('all presets are exported from barrel', async () => {
    const presets = await import('../../../../src/core/ai/presets')
    expect(typeof presets.tradingAgentPreset).toBe('function')
    expect(typeof presets.autoTradingAgentPreset).toBe('function')
  })
})
