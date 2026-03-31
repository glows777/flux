/**
 * Phase 3 Step 6: FinanceTab Unit Tests
 *
 * Test cases:
 * - Renders L1 skeleton while loading
 * - Renders L1 data when loaded
 * - Renders L2 shimmer while L2 is loading
 * - Renders L2 data after AI analysis completes
 * - Shows error when L1 fetch fails
 * - Shows L2 error when analysis fails
 * - Shows special "no transcript" error for 404
 * - Quarter switcher changes trigger data refetch
 * - Refresh triggers forceRefresh
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import type { CachedEarningsL1, CachedEarningsL2, FiscalQuarter } from '@/lib/finance/types'


// ─── Mock data ───

const mockL1Result: CachedEarningsL1 = {
    data: {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        period: 'FY2025 Q1',
        reportDate: '2025-01-30',
        beatMiss: {
            revenue: { actual: 124300000000, expected: 118900000000 },
            eps: { actual: 2.40, expected: 2.35 },
        },
        margins: [
            { quarter: 'Q1 2025', gross: 46.9, operating: 35.9, net: 28.2 },
        ],
        keyFinancials: {
            revenue: 124300000000,
            revenueYoY: 4.0,
            operatingIncome: 44600000000,
            fcf: 30900000000,
            debtToAssets: 0.32,
        },
    },
    cachedAt: '2025-01-31T10:00:00Z',
    cached: true,
    reportDate: '2025-01-30',
}

const mockL2Result: CachedEarningsL2 = {
    data: {
        symbol: 'AAPL',
        period: 'FY2025 Q1',
        tldr: '苹果Q1业绩强劲，超出预期。',
        guidance: {
            nextQuarterRevenue: '预计Q2营收$900-940亿',
            fullYearAdjustment: '维持',
            keyQuote: 'Strong momentum.',
            signal: '正面',
        },
        segments: [
            { name: 'iPhone', value: '$69.1B', yoy: '+6%', comment: '增长稳健' },
        ],
        managementSignals: {
            tone: '乐观',
            keyPhrases: ['record revenue'],
            quotes: [{ en: 'Best quarter', cn: '最好的季度' }],
            analystFocus: ['AI功能'],
        },
        suggestedQuestions: ['iPhone趋势?'],
    },
    cachedAt: '2025-01-31T11:00:00Z',
    cached: true,
    reportDate: '2025-01-30',
}

const mockQuarters: FiscalQuarter[] = [
    { year: 2025, quarter: 1, key: '2025-Q1', label: '2025 Q1 (2025-01-30)', date: '2025-01-30' },
    { year: 2024, quarter: 4, key: '2024-Q4', label: '2024 Q4 (2024-10-30)', date: '2024-10-30' },
]

// ─── Mocks ───

let mockQuartersData: FiscalQuarter[] | undefined = undefined
let mockQuartersLoading = false

let mockL1Data: CachedEarningsL1 | undefined = undefined
let mockL1Loading = true
let mockL1Error: Error | undefined = undefined
const mockL1Mutate = mock(() => Promise.resolve())

let mockL2Data: CachedEarningsL2 | undefined = undefined
let mockL2Loading = false
let mockL2Error: Error | undefined = undefined
const mockL2Mutate = mock(() => Promise.resolve())

mock.module('swr', () => ({
    __esModule: true,
    default: (key: string | null) => {
        if (key === null) {
            return { data: undefined, isLoading: false, error: undefined, mutate: mockL2Mutate }
        }
        if (typeof key === 'string' && key.startsWith('earnings-analysis:')) {
            return { data: mockL2Data, isLoading: mockL2Loading, error: mockL2Error, mutate: mockL2Mutate }
        }
        if (typeof key === 'string' && key.includes('/earnings/quarters')) {
            return { data: mockQuartersData, isLoading: mockQuartersLoading, error: undefined, mutate: mock(() => {}) }
        }
        if (typeof key === 'string' && key.includes('/earnings')) {
            return { data: mockL1Data, isLoading: mockL1Loading, error: mockL1Error, mutate: mockL1Mutate }
        }
        return { data: undefined, isLoading: false, error: undefined, mutate: mock(() => {}) }
    },
}))

mock.module('@/lib/fetcher', () => ({
    fetcher: mock(() => Promise.resolve({})),
}))

mock.module('@/lib/api', () => ({
    client: {
        api: {
            stocks: {
                ':symbol': {
                    earnings: {
                        analysis: {
                            $post: mock(() =>
                                Promise.resolve({
                                    json: () => Promise.resolve({ success: true, data: {} }),
                                }),
                            ),
                        },
                    },
                },
            },
        },
    },
}))

const { FinanceTab } = await import('@/components/detail/tabs/FinanceTab')

beforeEach(() => {
    mockQuartersData = mockQuarters
    mockQuartersLoading = false
    mockL1Data = undefined
    mockL1Loading = true
    mockL1Error = undefined
    mockL2Data = undefined
    mockL2Loading = false
    mockL2Error = undefined
})

afterEach(() => {
    cleanup()
})

describe('FinanceTab', () => {
    it('renders L1 skeleton while loading', () => {
        mockL1Loading = true
        const { container } = render(<FinanceTab symbol='AAPL' />)

        const pulseElements = container.querySelectorAll('.animate-pulse')
        expect(pulseElements.length).toBeGreaterThan(0)
    })

    it('renders L1 data when loaded', () => {
        mockL1Data = mockL1Result
        mockL1Loading = false
        render(<FinanceTab symbol='AAPL' />)

        // Beat/Miss cards should be present
        expect(screen.getByText('EPS')).toBeTruthy()
        // Both revenue and EPS beat
        const beats = screen.getAllByText('Beat')
        expect(beats.length).toBe(2)
    })

    it('renders L2 shimmer while L2 is loading', () => {
        mockL1Data = mockL1Result
        mockL1Loading = false
        mockL2Loading = true
        render(<FinanceTab symbol='AAPL' />)

        expect(screen.getByText('AI 分析中...')).toBeTruthy()
    })

    it('renders L2 data after AI analysis completes', () => {
        mockL1Data = mockL1Result
        mockL1Loading = false
        mockL2Data = mockL2Result
        mockL2Loading = false
        render(<FinanceTab symbol='AAPL' />)

        expect(screen.getByText(/苹果Q1业绩强劲/)).toBeTruthy()
        expect(screen.getByText('iPhone')).toBeTruthy()
    })

    it('shows error when L1 fetch fails', () => {
        mockL1Loading = false
        mockL1Error = new Error('FMP API error')
        render(<FinanceTab symbol='AAPL' />)

        expect(screen.getByText(/获取失败/)).toBeTruthy()
        // Should show generic message, not raw error
        expect(screen.getByText('请稍后重试')).toBeTruthy()
    })

    it('shows L2 error when analysis fails', () => {
        mockL1Data = mockL1Result
        mockL1Loading = false
        mockL2Error = new Error('AI analysis failed')
        render(<FinanceTab symbol='AAPL' />)

        // L1 should still render
        expect(screen.getByText('EPS')).toBeTruthy()
        // L2 error should be shown with generic message
        expect(screen.getByText(/分析失败/)).toBeTruthy()
    })

    it('shows special "no transcript" message for NOT_FOUND errors', () => {
        mockL1Data = mockL1Result
        mockL1Loading = false
        const err = new Error('No transcript available') as Error & { code: string }
        err.code = 'NOT_FOUND'
        mockL2Error = err
        render(<FinanceTab symbol='AAPL' />)

        expect(screen.getByText(/暂无 Earnings Call Transcript/)).toBeTruthy()
    })

    it('renders quarter switcher', () => {
        mockL1Data = mockL1Result
        mockL1Loading = false
        render(<FinanceTab symbol='AAPL' />)

        // Quarter selector should be present
        const select = screen.getByRole('combobox')
        expect(select).toBeTruthy()
    })

    it('renders separator between L1 and L2', () => {
        mockL1Data = mockL1Result
        mockL1Loading = false
        mockL2Data = mockL2Result
        mockL2Loading = false
        const { container } = render(<FinanceTab symbol='AAPL' />)

        // Check for a divider/separator element
        const separator = container.querySelector('[class*="border-t"], hr')
        expect(separator).toBeTruthy()
    })
})
