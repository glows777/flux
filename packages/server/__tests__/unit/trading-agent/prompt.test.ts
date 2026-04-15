import { describe, expect, it } from 'bun:test'
import { buildContext, TRADING_AGENT_PROMPT } from '@/core/trading-agent/prompt'
import type { HeartbeatContext } from '@/core/trading-agent/types'

describe('TRADING_AGENT_PROMPT', () => {
    it('contains the identity and goal', () => {
        expect(TRADING_AGENT_PROMPT).toContain('二级市场交易员')
        expect(TRADING_AGENT_PROMPT).toContain('50%')
    })

    it('references strategy.md with trading-agent/ prefix', () => {
        expect(TRADING_AGENT_PROMPT).toContain('trading-agent/strategy.md')
    })

    it('does not define specific trading strategy', () => {
        expect(TRADING_AGENT_PROMPT).not.toContain('RSI')
        expect(TRADING_AGENT_PROMPT).not.toContain('MA20')
        expect(TRADING_AGENT_PROMPT).not.toContain('MACD')
    })
})

describe('buildContext', () => {
    const ctx: HeartbeatContext = {
        timestamp: new Date('2026-03-25T21:30:00Z'),
        marketStatus: '开盘',
        equity: 75000,
        baseline: 50000,
        progress: 50,
    }

    it('formats all required fields', () => {
        const result = buildContext(ctx)
        expect(result).toContain('75,000')
        expect(result).toContain('50,000')
        expect(result).toContain('+50.00%')
        expect(result).toContain('100%')
        expect(result).toContain('开盘')
    })

    it('formats timestamp in ET timezone', () => {
        const result = buildContext(ctx)
        expect(result).toContain('ET')
    })

    it('calculates target progress correctly', () => {
        const half = buildContext({ ...ctx, progress: 25 })
        expect(half).toContain('50%')

        const over = buildContext({ ...ctx, progress: 75 })
        expect(over).toContain('150%')
    })

    it('handles negative progress', () => {
        const loss = buildContext({ ...ctx, progress: -10 })
        expect(loss).toContain('-10.00%')
    })
})
