import { describe, expect, it } from 'bun:test'
import { getCompletionSummary, getLoadingLabel } from '@/core/ai/tool-display'

describe('getLoadingLabel', () => {
  it('returns fallback for unknown tool', () => {
    expect(getLoadingLabel('unknownTool')).toBe('处理')
  })

  it('getQuote without input', () => {
    expect(getLoadingLabel('getQuote')).toBe('查询报价')
  })

  it('getQuote with symbol', () => {
    expect(getLoadingLabel('getQuote', { symbol: 'AAPL' })).toBe('查询 AAPL 报价')
  })

  it('getCompanyInfo with symbol', () => {
    expect(getLoadingLabel('getCompanyInfo', { symbol: 'TSLA' })).toBe('获取 TSLA 公司信息')
  })

  it('getNews without input', () => {
    expect(getLoadingLabel('getNews')).toBe('搜索新闻')
  })

  it('getNews with symbol', () => {
    expect(getLoadingLabel('getNews', { symbol: 'MSFT' })).toBe('搜索 MSFT 新闻')
  })

  it('getHistory with symbol and days', () => {
    expect(getLoadingLabel('getHistory', { symbol: 'AAPL', days: 90 })).toBe('获取 AAPL 近 90 天历史')
  })

  it('getHistory with symbol only', () => {
    expect(getLoadingLabel('getHistory', { symbol: 'AAPL' })).toBe('获取 AAPL 历史数据')
  })

  it('calculateIndicators with symbol', () => {
    expect(getLoadingLabel('calculateIndicators', { symbol: 'NVDA' })).toBe('计算 NVDA 技术指标')
  })

  it('getReport with symbol', () => {
    expect(getLoadingLabel('getReport', { symbol: 'GOOG' })).toBe('获取 GOOG 研报')
  })

  it('searchStock with query', () => {
    expect(getLoadingLabel('searchStock', { query: '英伟达' })).toBe('搜索 "英伟达"')
  })

  it('searchStock without query', () => {
    expect(getLoadingLabel('searchStock')).toBe('搜索股票')
  })

  it('update_core_memory with slot', () => {
    expect(getLoadingLabel('update_core_memory', { slot: 'market_views' })).toBe('更新 market_views 记忆')
  })

  it('update_core_memory without input', () => {
    expect(getLoadingLabel('update_core_memory')).toBe('更新记忆')
  })

  it('save_lesson always returns fixed label', () => {
    expect(getLoadingLabel('save_lesson')).toBe('记录教训')
  })

  it('read_history with slot', () => {
    expect(getLoadingLabel('read_history', { slot: 'lessons' })).toBe('回顾 lessons 历史')
  })

  it('read_history without input', () => {
    expect(getLoadingLabel('read_history')).toBe('回顾历史记录')
  })

  it('webSearch with query', () => {
    expect(getLoadingLabel('webSearch', { query: 'AAPL Q1 earnings' })).toBe('搜索 "AAPL Q1 earnings"')
  })

  it('webSearch without input', () => {
    expect(getLoadingLabel('webSearch')).toBe('搜索互联网')
  })

  it('webFetch with url extracts hostname', () => {
    expect(getLoadingLabel('webFetch', { url: 'https://www.reuters.com/article/123' })).toBe('阅读 www.reuters.com')
  })

  it('webFetch without input', () => {
    expect(getLoadingLabel('webFetch')).toBe('阅读网页')
  })

  it('display_rating_card returns fixed label', () => {
    expect(getLoadingLabel('display_rating_card')).toBe('生成评级卡片')
  })

  it('display_comparison_table returns fixed label', () => {
    expect(getLoadingLabel('display_comparison_table')).toBe('生成对比表格')
  })

  it('display_signal_badges returns fixed label', () => {
    expect(getLoadingLabel('display_signal_badges')).toBe('生成技术信号')
  })
})

describe('getCompletionSummary', () => {
  it('returns null for null output', () => {
    expect(getCompletionSummary('getQuote', null)).toBeNull()
  })

  it('returns null for undefined output', () => {
    expect(getCompletionSummary('getQuote')).toBeNull()
  })

  it('returns error message when output has error key', () => {
    expect(getCompletionSummary('getQuote', { error: 'API rate limit exceeded' })).toBe('失败: API rate limit exceeded')
  })

  it('truncates long error messages to 50 chars', () => {
    const longError = 'A'.repeat(80)
    const result = getCompletionSummary('getQuote', { error: longError })
    expect(result).toBe(`失败: ${'A'.repeat(50)}...`)
  })

  it('getQuote returns formatted price and change', () => {
    const result = getCompletionSummary('getQuote', { price: 198.5, change: 1.2 })
    expect(result).toBe('$198.50 (+1.20%)')
  })

  it('getQuote returns price only when change is missing', () => {
    const result = getCompletionSummary('getQuote', { price: 198.5 })
    expect(result).toBe('$198.50')
  })

  it('getQuote returns null for non-object output', () => {
    expect(getCompletionSummary('getQuote', 'invalid')).toBeNull()
  })

  it('getCompanyInfo returns name and PE', () => {
    const result = getCompletionSummary('getCompanyInfo', { name: 'Apple Inc.', pe: 32.1 })
    expect(result).toBe('Apple Inc. · PE 32.10')
  })

  it('getCompanyInfo returns name only when pe is missing', () => {
    const result = getCompletionSummary('getCompanyInfo', { name: 'Apple Inc.' })
    expect(result).toBe('Apple Inc.')
  })

  it('getNews counts array length', () => {
    const articles = Array.from({ length: 5 }, () => ({ title: 'News' }))
    expect(getCompletionSummary('getNews', articles)).toBe('找到 5 条新闻')
  })

  it('getHistory counts data points', () => {
    const points = Array.from({ length: 90 }, () => ({ date: '2025-01-01', close: 100 }))
    expect(getCompletionSummary('getHistory', points)).toBe('已获取 90 天历史数据')
  })

  it('calculateIndicators shows RSI and MACD golden cross', () => {
    const result = getCompletionSummary('calculateIndicators', { rsi: 62.3, macd: { crossover: 'golden' } })
    expect(result).toBe('RSI 62 · MACD 金叉')
  })

  it('calculateIndicators shows MACD death cross', () => {
    const result = getCompletionSummary('calculateIndicators', { rsi: 35, macd: { crossover: 'death' } })
    expect(result).toBe('RSI 35 · MACD 死叉')
  })

  it('calculateIndicators shows RSI only', () => {
    const result = getCompletionSummary('calculateIndicators', { rsi: 70 })
    expect(result).toBe('RSI 70')
  })

  it('calculateIndicators returns null for empty object', () => {
    expect(getCompletionSummary('calculateIndicators', {})).toBeNull()
  })

  it('getReport returns loaded when content is truthy', () => {
    expect(getCompletionSummary('getReport', { content: '# Report' })).toBe('研报已加载')
  })

  it('getReport returns no cache when content is falsy', () => {
    expect(getCompletionSummary('getReport', { content: null })).toBe('暂无缓存研报')
  })

  it('searchStock counts results', () => {
    const results = [{ symbol: 'NVDA' }, { symbol: 'NVDS' }, { symbol: 'NVD' }]
    expect(getCompletionSummary('searchStock', results)).toBe('找到 3 个匹配')
  })

  it('update_core_memory returns slot name from message', () => {
    expect(getCompletionSummary('update_core_memory', { success: true, slot: 'lessons', message: '已更新 lessons' })).toBe('已更新 lessons')
  })

  it('save_lesson returns fixed label', () => {
    expect(getCompletionSummary('save_lesson', { success: true })).toBe('已记录教训')
  })

  it('read_history counts versions', () => {
    const output = { slot: 'lessons', versions: [{ id: '1' }, { id: '2' }] }
    expect(getCompletionSummary('read_history', output)).toBe('找到 2 条历史')
  })

  it('webFetch extracts hostname from output url', () => {
    const output = { url: 'https://www.reuters.com/article/xyz', content: '...' }
    expect(getCompletionSummary('webFetch', output)).toBe('已阅读 www.reuters.com')
  })

  it('webSearch returns null (has its own component)', () => {
    expect(getCompletionSummary('webSearch', { results: [] })).toBeNull()
  })

  it('display_rating_card returns null', () => {
    expect(getCompletionSummary('display_rating_card', { rating: 'BUY' })).toBeNull()
  })

  it('display_comparison_table returns null', () => {
    expect(getCompletionSummary('display_comparison_table', { rows: [] })).toBeNull()
  })

  it('display_signal_badges returns null', () => {
    expect(getCompletionSummary('display_signal_badges', { signals: [] })).toBeNull()
  })

  it('unknown tool returns null', () => {
    expect(getCompletionSummary('unknownTool', { data: 'something' })).toBeNull()
  })
})
