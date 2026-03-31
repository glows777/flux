import { describe, expect, it } from 'bun:test'
import { buildReviewAgentPrompt } from '@/core/ai/prompts'

describe('buildReviewAgentPrompt', () => {
  it('contains review workflow keywords', () => {
    const prompt = buildReviewAgentPrompt()
    expect(prompt).toContain('复盘')
    expect(prompt).toContain('getTradeHistory')
    expect(prompt).toContain('getPortfolio')
    expect(prompt).toContain('trading-lessons.md')
    expect(prompt).toContain('memory_write')
  })

  it('does not contain Trade Loop behavior', () => {
    const prompt = buildReviewAgentPrompt()
    expect(prompt).not.toContain('Trade Loop')
    expect(prompt).not.toContain('placeOrder')
  })

  it('includes memory context when provided', () => {
    const prompt = buildReviewAgentPrompt({ memoryContext: '## 当前持仓\nNVDA 10 shares' })
    expect(prompt).toContain('当前持仓')
    expect(prompt).toContain('NVDA')
  })

  it('includes 20-lesson cap instruction', () => {
    const prompt = buildReviewAgentPrompt()
    expect(prompt).toContain('20')
  })
})
