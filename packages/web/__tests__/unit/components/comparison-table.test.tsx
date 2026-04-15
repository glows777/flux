/**
 * P2: ComparisonTable Component Tests
 *
 * Test cases:
 * P2-T14: 渲染表格标题
 * P2-T15: 渲染表头 (symbol 列)
 * P2-T16: 渲染数据行
 * P2-T17: highlight 颜色正确
 * P2-T18: 空 rows 不渲染
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

const { ComparisonTable } = await import(
    '@/components/detail/tabs/chat/ComparisonTable'
)

afterEach(() => {
    cleanup()
})

const baseData = {
    title: 'NVDA vs AMD 核心指标对比',
    rows: [
        {
            metric: '市盈率',
            values: [
                {
                    symbol: 'NVDA',
                    value: '55.2x',
                    highlight: 'neutral' as const,
                },
                {
                    symbol: 'AMD',
                    value: '45.1x',
                    highlight: 'positive' as const,
                },
            ],
        },
        {
            metric: '总市值',
            values: [
                {
                    symbol: 'NVDA',
                    value: '$3.2T',
                    highlight: 'positive' as const,
                },
                {
                    symbol: 'AMD',
                    value: '$280B',
                    highlight: 'negative' as const,
                },
            ],
        },
        {
            metric: '每股收益',
            values: [
                { symbol: 'NVDA', value: '$2.13' },
                { symbol: 'AMD', value: '$0.85' },
            ],
        },
    ],
}

describe('ComparisonTable', () => {
    it('P2-T14: 渲染表格标题', () => {
        render(<ComparisonTable data={baseData} />)

        expect(screen.getByText('NVDA vs AMD 核心指标对比')).toBeDefined()
    })

    it('P2-T15: 渲染表头 (symbol 列)', () => {
        render(<ComparisonTable data={baseData} />)

        // Table headers should contain both symbols
        const headers = screen.getAllByRole('columnheader')
        const headerTexts = headers.map((h) => h.textContent)
        expect(headerTexts).toContain('NVDA')
        expect(headerTexts).toContain('AMD')
    })

    it('P2-T16: 渲染数据行', () => {
        render(<ComparisonTable data={baseData} />)

        expect(screen.getByText('市盈率')).toBeDefined()
        expect(screen.getByText('总市值')).toBeDefined()
        expect(screen.getByText('每股收益')).toBeDefined()
        expect(screen.getByText('55.2x')).toBeDefined()
        expect(screen.getByText('$3.2T')).toBeDefined()
    })

    it('P2-T17: highlight 颜色正确', () => {
        render(<ComparisonTable data={baseData} />)

        const positiveCell = screen.getByText('45.1x')
        expect(positiveCell.className).toContain('emerald')

        const negativeCell = screen.getByText('$280B')
        expect(negativeCell.className).toContain('red')

        const neutralCell = screen.getByText('55.2x')
        expect(neutralCell.className).toContain('slate')
    })

    it('P2-T18: 空 rows 不渲染', () => {
        const { container } = render(<ComparisonTable data={{ rows: [] }} />)

        expect(container.innerHTML).toBe('')
    })

    it('无标题时不渲染标题区域', () => {
        render(<ComparisonTable data={{ rows: baseData.rows }} />)

        expect(screen.queryByText('NVDA vs AMD 核心指标对比')).toBeNull()
        // But table should still render
        expect(screen.getByText('市盈率')).toBeDefined()
    })
})
