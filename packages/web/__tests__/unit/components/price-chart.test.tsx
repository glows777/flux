import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

const AreaChartStub = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid='area-chart'>{children}</div>
)

mock.module('recharts', () => ({
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
        <div data-testid='responsive-container'>{children}</div>
    ),
    AreaChart: AreaChartStub,
    Area: () => <div data-testid='area' />,
    LineChart: ({ children }: { children?: React.ReactNode }) => (
        <div data-testid='line-chart'>{children}</div>
    ),
    Line: () => <div data-testid='line' />,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Tooltip: () => null,
    YAxis: () => null,
}))

mock.module('@/components/detail/PeriodButton', () => ({
    PeriodButton: ({
        label,
        active,
        onClick,
    }: {
        label: string
        active: boolean
        onClick: () => void
    }) => (
        <button
            type='button'
            data-active={active}
            onClick={onClick}
        >
            {label}
        </button>
    ),
}))

let mockHistoryData: unknown
let mockQuoteData: unknown

mock.module('swr', () => ({
    __esModule: true,
    default: (key: string) => {
        if (key.includes('/history?period=')) {
            return {
                data: mockHistoryData,
                isLoading: false,
                error: undefined,
            }
        }

        if (key.endsWith('/quote')) {
            return {
                data: mockQuoteData,
                isLoading: false,
                error: undefined,
            }
        }

        return {
            data: undefined,
            isLoading: false,
            error: undefined,
        }
    },
}))

mock.module('@/lib/fetcher', () => ({
    fetcher: mock(() => Promise.resolve({})),
}))

const { PriceChart } = await import('@/components/detail/PriceChart')

afterEach(() => {
    cleanup()
    mockHistoryData = undefined
    mockQuoteData = undefined
})

describe('PriceChart', () => {
    it('prefers realtime quote for headline price and change', () => {
        mockHistoryData = {
            symbol: 'NVDA',
            period: '1M',
            points: [
                {
                    date: '2026-04-14',
                    open: 100,
                    high: 110,
                    low: 90,
                    close: 105,
                },
            ],
        }
        mockQuoteData = {
            symbol: 'NVDA',
            price: 120.55,
            change: 3.25,
            timestamp: '2026-04-15T14:35:00.000Z',
        }

        render(<PriceChart symbol='NVDA' name='NVIDIA' />)

        expect(screen.getByText('$120.55')).toBeTruthy()
        expect(screen.getByText('+3.25%')).toBeTruthy()
    })

    it('falls back to history close when quote is unavailable', () => {
        mockHistoryData = {
            symbol: 'NVDA',
            period: '1M',
            points: [
                {
                    date: '2026-04-14',
                    open: 100,
                    high: 110,
                    low: 90,
                    close: 105,
                },
            ],
        }
        mockQuoteData = undefined

        render(<PriceChart symbol='NVDA' name='NVIDIA' />)

        expect(screen.getByText('$105.00')).toBeTruthy()
        expect(screen.getByText('+5.00%')).toBeTruthy()
    })
})
