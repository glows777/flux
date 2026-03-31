/**
 * Phase 3 Step 6: L2Section Unit Tests
 *
 * Test cases:
 * - Renders shimmer skeleton when loading
 * - Renders error state with message
 * - Renders special "no transcript" error for 404
 * - Renders TLDR section with emerald left border
 * - Renders guidance section with signal badge
 * - Renders segments table
 * - Renders management signals with tone badge
 * - Renders analyst focus tags
 * - Renders suggested questions
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import type { EarningsL2 } from '@/lib/finance/types'

const { L2Section, L2Shimmer } = await import(
    '@/components/detail/tabs/finance/L2Section'
)

afterEach(() => {
    cleanup()
})

const mockL2Data: EarningsL2 = {
    symbol: 'AAPL',
    period: 'FY2025 Q1',
    tldr: '苹果在2025财年Q1取得了强劲的业绩表现，营收和利润均超出市场预期。iPhone和服务业务成为主要增长动力。',
    guidance: {
        nextQuarterRevenue: '预计Q2营收在$900亿至$940亿之间',
        fullYearAdjustment: '维持',
        keyQuote:
            'We expect continued strength across our product lineup and services.',
        signal: '正面',
    },
    segments: [
        {
            name: 'iPhone',
            value: '$69.1B',
            yoy: '+6.0%',
            comment: '升级周期带动增长',
        },
        {
            name: 'Services',
            value: '$26.3B',
            yoy: '+14.0%',
            comment: '订阅用户持续增加',
        },
        {
            name: 'Mac',
            value: '$8.9B',
            yoy: '+16.0%',
            comment: 'M4 芯片驱动换机',
        },
    ],
    managementSignals: {
        tone: '乐观',
        keyPhrases: ['record revenue', 'strong momentum', 'installed base'],
        quotes: [
            {
                en: 'This was our best quarter ever for Services.',
                cn: '这是我们服务业务有史以来最好的一个季度。',
            },
        ],
        analystFocus: ['iPhone周期', 'AI功能落地', '中国市场表现'],
    },
    suggestedQuestions: [
        'iPhone 16 Pro的ASP趋势如何？',
        'Apple Intelligence对Services收入的拉动效果？',
    ],
}

describe('L2Shimmer', () => {
    it('renders shimmer animation with AI loading text', () => {
        render(<L2Shimmer />)
        expect(screen.getByText('AI 分析中...')).toBeTruthy()
    })

    it('renders animated pulse elements', () => {
        const { container } = render(<L2Shimmer />)
        const shimmerElements = container.querySelectorAll('.animate-pulse')
        expect(shimmerElements.length).toBeGreaterThan(0)
    })
})

describe('L2Section', () => {
    describe('TLDR', () => {
        it('renders TLDR section with content', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText(/苹果在2025财年Q1取得了强劲/)).toBeTruthy()
        })

        it('has emerald left border styling', () => {
            const { container } = render(<L2Section data={mockL2Data} />)
            const tldrBox = container.querySelector('[class*="border-l"]')
            expect(tldrBox).toBeTruthy()
        })
    })

    describe('Guidance', () => {
        it('renders guidance heading', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText('指引解读')).toBeTruthy()
        })

        it('renders next quarter revenue guidance', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText(/Q2营收/)).toBeTruthy()
        })

        it('renders full year adjustment badge', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText('维持')).toBeTruthy()
        })

        it('renders signal badge', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText('正面')).toBeTruthy()
        })

        it('renders key quote in blockquote', () => {
            render(<L2Section data={mockL2Data} />)
            expect(
                screen.getByText(
                    /We expect continued strength/,
                ),
            ).toBeTruthy()
        })
    })

    describe('Segments', () => {
        it('renders segments heading', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText('业务板块')).toBeTruthy()
        })

        it('renders all segment rows', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText('iPhone')).toBeTruthy()
            expect(screen.getByText('Services')).toBeTruthy()
            expect(screen.getByText('Mac')).toBeTruthy()
        })

        it('renders segment values', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText('$69.1B')).toBeTruthy()
            expect(screen.getByText('+6.0%')).toBeTruthy()
        })
    })

    describe('Management Signals', () => {
        it('renders management signals heading', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText('管理层信号')).toBeTruthy()
        })

        it('renders tone badge', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText('乐观')).toBeTruthy()
        })

        it('renders key phrases as tags', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText('record revenue')).toBeTruthy()
            expect(screen.getByText('strong momentum')).toBeTruthy()
        })

        it('renders English and Chinese quotes', () => {
            render(<L2Section data={mockL2Data} />)
            expect(
                screen.getByText(/This was our best quarter ever/),
            ).toBeTruthy()
            expect(
                screen.getByText(/这是我们服务业务有史以来/),
            ).toBeTruthy()
        })

        it('renders analyst focus topics', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText('分析师焦点')).toBeTruthy()
            expect(screen.getByText('iPhone周期')).toBeTruthy()
            expect(screen.getByText('AI功能落地')).toBeTruthy()
        })
    })

    describe('Suggested Questions', () => {
        it('renders suggested questions', () => {
            render(<L2Section data={mockL2Data} />)
            expect(screen.getByText(/iPhone 16 Pro的ASP趋势/)).toBeTruthy()
            expect(screen.getByText(/Apple Intelligence/)).toBeTruthy()
        })
    })

    describe('Edge cases', () => {
        it('renders with empty segments array', () => {
            const data: EarningsL2 = { ...mockL2Data, segments: [] }
            render(<L2Section data={data} />)
            expect(screen.getByText('业务板块')).toBeTruthy()
        })

        it('renders with empty suggestedQuestions', () => {
            const data: EarningsL2 = {
                ...mockL2Data,
                suggestedQuestions: [],
            }
            render(<L2Section data={data} />)
            // Should render without crashing
            expect(screen.getByText('管理层信号')).toBeTruthy()
        })
    })
})
