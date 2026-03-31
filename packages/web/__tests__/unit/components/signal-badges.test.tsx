/**
 * P2: SignalBadges Component Tests
 *
 * Test cases:
 * P2-T19: 渲染信号徽章列表
 * P2-T20: bullish/bearish/neutral 显示不同颜色
 * P2-T21: 渲染综合偏向标签
 * P2-T22: 空 signals 不渲染
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

const { SignalBadges } = await import(
    '@/components/detail/tabs/chat/SignalBadges'
)

afterEach(() => {
    cleanup()
})

const baseData = {
    symbol: 'NVDA',
    signals: [
        { name: 'RSI 超卖', type: 'bullish' as const, strength: 'strong' as const, detail: 'RSI=25' },
        { name: 'MACD 死叉', type: 'bearish' as const, strength: 'moderate' as const },
        { name: 'MA20 持平', type: 'neutral' as const, strength: 'weak' as const },
    ],
    overallBias: 'bullish' as const,
}

describe('SignalBadges', () => {
    it('P2-T19: 渲染信号徽章列表', () => {
        render(<SignalBadges data={baseData} />)

        expect(screen.getByText('RSI 超卖')).toBeDefined()
        expect(screen.getByText('MACD 死叉')).toBeDefined()
        expect(screen.getByText('MA20 持平')).toBeDefined()
    })

    it('P2-T20: bullish/bearish/neutral 显示不同颜色', () => {
        render(<SignalBadges data={baseData} />)

        const bullishBadge = screen.getByText('RSI 超卖').closest('div')!
        expect(bullishBadge.className).toContain('emerald')

        const bearishBadge = screen.getByText('MACD 死叉').closest('div')!
        expect(bearishBadge.className).toContain('red')

        const neutralBadge = screen.getByText('MA20 持平').closest('div')!
        expect(neutralBadge.className).toContain('slate')
    })

    it('P2-T21: 渲染综合偏向标签', () => {
        render(<SignalBadges data={baseData} />)

        expect(screen.getByText('综合 偏多')).toBeDefined()
    })

    it('P2-T21b: bearish 偏向显示偏空', () => {
        render(
            <SignalBadges data={{ ...baseData, overallBias: 'bearish' }} />,
        )

        expect(screen.getByText('综合 偏空')).toBeDefined()
    })

    it('P2-T21c: neutral 偏向显示中性', () => {
        render(
            <SignalBadges data={{ ...baseData, overallBias: 'neutral' }} />,
        )

        expect(screen.getByText('综合 中性')).toBeDefined()
    })

    it('P2-T22: 空 signals 不渲染', () => {
        const { container } = render(
            <SignalBadges data={{ ...baseData, signals: [] }} />,
        )

        expect(container.innerHTML).toBe('')
    })

    it('渲染 symbol 标识', () => {
        render(<SignalBadges data={baseData} />)

        expect(screen.getByText('NVDA 技术信号')).toBeDefined()
    })

    it('渲染强度标签', () => {
        render(<SignalBadges data={baseData} />)

        expect(screen.getByText('(强)')).toBeDefined()
        expect(screen.getByText('(中)')).toBeDefined()
        expect(screen.getByText('(弱)')).toBeDefined()
    })
})
