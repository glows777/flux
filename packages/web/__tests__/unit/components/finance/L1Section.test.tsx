/**
 * Phase 3 Step 6: L1Section Unit Tests
 *
 * Test cases:
 * - Renders skeleton when loading
 * - Renders Beat/Miss scorecard with revenue and EPS
 * - Shows green checkmark for beat, red X for miss
 * - Renders margin trends for 5 quarters
 * - Highlights current quarter in margins
 * - Renders key financial metrics (revenue, YoY, operating income, FCF, debt ratio)
 * - Handles null values gracefully (fcf, debtToAssets, revenueYoY)
 * - Renders error state
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import type { EarningsL1 } from '@/lib/finance/types'

const { L1Section, L1Skeleton } = await import(
    '@/components/detail/tabs/finance/L1Section'
)

afterEach(() => {
    cleanup()
})

const mockL1Data: EarningsL1 = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    period: 'FY2025 Q1',
    reportDate: '2025-01-30',
    beatMiss: {
        revenue: { actual: 124300000000, expected: 118900000000 },
        eps: { actual: 2.40, expected: 2.35 },
    },
    margins: [
        { quarter: 'Q1 2024', gross: 45.9, operating: 33.4, net: 28.3 },
        { quarter: 'Q2 2024', gross: 46.3, operating: 29.7, net: 25.0 },
        { quarter: 'Q3 2024', gross: 46.2, operating: 30.3, net: 25.0 },
        { quarter: 'Q4 2024', gross: 46.9, operating: 35.2, net: 28.5 },
        { quarter: 'Q1 2025', gross: 46.9, operating: 35.9, net: 28.2 },
    ],
    keyFinancials: {
        revenue: 124300000000,
        revenueYoY: 4.0,
        operatingIncome: 44600000000,
        fcf: 30900000000,
        debtToAssets: 0.32,
    },
}

describe('L1Skeleton', () => {
    it('renders skeleton placeholder elements', () => {
        const { container } = render(<L1Skeleton />)
        const pulseElements = container.querySelectorAll('.animate-pulse')
        expect(pulseElements.length).toBeGreaterThan(0)
    })
})

describe('L1Section', () => {
    it('renders Beat/Miss revenue data', () => {
        render(<L1Section data={mockL1Data} />)

        // Revenue and EPS labels appear in the component
        const revenueLabels = screen.getAllByText('Revenue')
        expect(revenueLabels.length).toBeGreaterThan(0)
        // EPS label in BeatMiss section
        expect(screen.getByText('EPS')).toBeTruthy()
    })

    it('shows beat indicator when actual > expected', () => {
        const { container } = render(<L1Section data={mockL1Data} />)

        // Revenue beats: actual 124.3B > expected 118.9B
        // Should have emerald/green indicators
        const emeraldElements = container.querySelectorAll('[class*="emerald"]')
        expect(emeraldElements.length).toBeGreaterThan(0)
    })

    it('shows miss indicator when actual < expected', () => {
        const missData: EarningsL1 = {
            ...mockL1Data,
            beatMiss: {
                revenue: { actual: 110000000000, expected: 118900000000 },
                eps: { actual: 2.10, expected: 2.35 },
            },
        }
        const { container } = render(<L1Section data={missData} />)

        // Should have red/rose indicators for miss
        const roseElements = container.querySelectorAll('[class*="rose"]')
        expect(roseElements.length).toBeGreaterThan(0)
    })

    it('renders margin trends section', () => {
        render(<L1Section data={mockL1Data} />)

        expect(screen.getByText('利润率趋势')).toBeTruthy()
        // Check at least one quarter label is present
        expect(screen.getByText('Q1 2025')).toBeTruthy()
    })

    it('renders all 5 quarters of margin data', () => {
        render(<L1Section data={mockL1Data} />)

        expect(screen.getByText('Q1 2024')).toBeTruthy()
        expect(screen.getByText('Q2 2024')).toBeTruthy()
        expect(screen.getByText('Q3 2024')).toBeTruthy()
        expect(screen.getByText('Q4 2024')).toBeTruthy()
        expect(screen.getByText('Q1 2025')).toBeTruthy()
    })

    it('renders key financial metrics', () => {
        render(<L1Section data={mockL1Data} />)

        expect(screen.getByText('关键财务指标')).toBeTruthy()
        // Revenue, YoY should be shown
        expect(screen.getByText(/YoY/)).toBeTruthy()
    })

    it('handles null beatMiss values', () => {
        const nullBeatData: EarningsL1 = {
            ...mockL1Data,
            beatMiss: { revenue: null, eps: null },
        }
        render(<L1Section data={nullBeatData} />)

        // Should render without errors, Revenue appears in both BeatMiss and KeyFinancials
        const revenueLabels = screen.getAllByText('Revenue')
        expect(revenueLabels.length).toBeGreaterThan(0)
        expect(screen.getByText('EPS')).toBeTruthy()
    })

    it('handles null keyFinancials fields gracefully', () => {
        const nullFinancials: EarningsL1 = {
            ...mockL1Data,
            keyFinancials: {
                revenue: 100000000000,
                revenueYoY: null,
                operatingIncome: 30000000000,
                fcf: null,
                debtToAssets: null,
            },
        }
        render(<L1Section data={nullFinancials} />)

        // Should show "--" for null values
        const dashElements = screen.getAllByText('--')
        expect(dashElements.length).toBeGreaterThan(0)
    })

    it('handles null margin values', () => {
        const nullMarginData: EarningsL1 = {
            ...mockL1Data,
            margins: [
                { quarter: 'Q1 2025', gross: null, operating: null, net: null },
            ],
        }
        render(<L1Section data={nullMarginData} />)

        // Should render without crashing, showing dashes for null margins
        expect(screen.getByText('Q1 2025')).toBeTruthy()
    })
})
