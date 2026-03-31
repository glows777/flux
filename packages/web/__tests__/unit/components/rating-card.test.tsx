/**
 * P2: RatingCard Component Tests
 *
 * Test cases:
 * P2-T10: 渲染评级标签 + symbol
 * P2-T11: 不同评级显示不同颜色
 * P2-T12: targetPrice 可选，不传时不渲染目标价
 * P2-T13: keyFactors 渲染列表
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

const { RatingCard } = await import(
    '@/components/detail/tabs/chat/RatingCard'
)

afterEach(() => {
    cleanup()
})

const baseData = {
    symbol: 'NVDA',
    rating: '买入' as const,
    confidence: 85,
    currentPrice: 150.5,
    summary: 'AI 需求持续增长',
    keyFactors: ['数据中心收入增长', 'AI 芯片领先地位'],
}

describe('RatingCard', () => {
    it('P2-T10: 渲染评级标签 + symbol', () => {
        render(<RatingCard data={baseData} />)

        expect(screen.getByText('买入')).toBeDefined()
        expect(screen.getByText('NVDA')).toBeDefined()
    })

    it('P2-T11: 不同评级显示不同颜色', () => {
        const ratings = ['强买', '买入', '持有', '卖出', '强卖'] as const
        const expectedColorFragments = [
            'emerald',
            'green',
            'yellow',
            'orange',
            'red',
        ]

        for (let idx = 0; idx < ratings.length; idx++) {
            cleanup()
            const { container } = render(
                <RatingCard data={{ ...baseData, rating: ratings[idx] }} />,
            )

            const badge = screen.getByText(ratings[idx])
            expect(
                badge.className.includes(expectedColorFragments[idx]),
                `Rating "${ratings[idx]}" should contain color "${expectedColorFragments[idx]}"`,
            ).toBe(true)
        }
    })

    it('P2-T12: targetPrice 可选，不传时不渲染目标价', () => {
        render(<RatingCard data={baseData} />)

        expect(screen.queryByText('目标价')).toBeNull()
    })

    it('P2-T12b: targetPrice 传入时渲染目标价', () => {
        render(<RatingCard data={{ ...baseData, targetPrice: 200 }} />)

        expect(screen.getByText('目标价')).toBeDefined()
        expect(screen.getByText('$200.00')).toBeDefined()
    })

    it('P2-T13: keyFactors 渲染列表', () => {
        render(<RatingCard data={baseData} />)

        expect(screen.getByText('数据中心收入增长')).toBeDefined()
        expect(screen.getByText('AI 芯片领先地位')).toBeDefined()
    })

    it('渲染置信度百分比', () => {
        render(<RatingCard data={baseData} />)

        expect(screen.getByText('置信度 85%')).toBeDefined()
    })

    it('渲染摘要', () => {
        render(<RatingCard data={baseData} />)

        expect(screen.getByText('AI 需求持续增长')).toBeDefined()
    })

    it('渲染当前价格', () => {
        render(<RatingCard data={baseData} />)

        expect(screen.getByText('$150.50')).toBeDefined()
    })
})
