/**
 * Task 06: DashboardContent + Watchlist Integration Tests
 * 8 test cases
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

// Mock lucide-react — all icons used in the component tree
const Stub = () => <span />

mock.module('lucide-react', () => ({
    Sparkles: Stub,
    ChevronRight: Stub,
    X: Stub,
    Plus: Stub,
    Settings: Stub,
    Check: Stub,
    Loader2: Stub,
    Trash2: Stub,
    Ellipsis: Stub,
    ArrowRight: Stub,
}))

// Mock next/navigation
mock.module('next/navigation', () => ({
    useRouter: () => ({ push: mock(() => {}) }),
    useSearchParams: () => ({ get: () => null }),
}))

// Mock api client
mock.module('@/lib/api', () => ({
    client: {
        api: {
            watchlist: {
                $post: mock(() => Promise.resolve({ ok: true })),
                ':symbol': {
                    $delete: mock(() => Promise.resolve({ ok: true })),
                },
            },
        },
    },
}))

// Mock SWR — DashboardContent now uses single /api/dashboard endpoint
const mockMutateDashboard = mock(() => Promise.resolve())

let mockDashboardData: unknown = null
let mockDashboardLoading = false
let mockDashboardError: unknown = undefined

mock.module('swr', () => ({
    __esModule: true,
    default: (key: string) => {
        if (key === '/api/dashboard') {
            return {
                data: mockDashboardData,
                isLoading: mockDashboardLoading,
                error: mockDashboardError,
                mutate: mockMutateDashboard,
            }
        }
        return { data: undefined, isLoading: false, error: undefined, mutate: mock(() => {}) }
    },
}))

// Mock fetcher
mock.module('@/lib/fetcher', () => ({
    fetcher: mock(() => Promise.resolve({})),
}))

const { DashboardContent } = await import('@/components/dashboard/DashboardContent')
const { WatchlistItem } = await import('@/components/dashboard/WatchlistItem')

afterEach(() => {
    cleanup()
    mockDashboardData = null
    mockDashboardLoading = false
    mockDashboardError = undefined
    mockMutateDashboard.mockClear()
})

describe('DashboardContent', () => {
    it('T06-01: dashboard loading shows StatsGridSkeleton', () => {
        mockDashboardLoading = true

        const { container } = render(<DashboardContent />)
        const skeletons = container.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    it('T06-02: loaded portfolio renders StatsGrid with real data', () => {
        mockDashboardData = {
            portfolio: {
                holdings: [{ symbol: 'AAPL', name: 'Apple', shares: 10, avgCost: 150, currentPrice: 180, dailyChange: 2, totalPnL: 300, dailyPnL: 35 }],
                summary: {
                    totalValue: 1800, totalCost: 1500, totalPnL: 300, totalPnLPercent: 20,
                    todayPnL: 35, todayPnLPercent: 1.98,
                    topContributor: { symbol: 'AAPL', name: 'Apple', dailyPnL: 35 },
                    vix: 13.4,
                },
            },
            watchlist: [],
            positionSymbols: [],
        }

        render(<DashboardContent />)
        expect(screen.getByText('总资产组合')).toBeTruthy()
        expect(screen.getByText('$1,800.00')).toBeTruthy()
    })

    it('T06-12: first card shows total PnL', () => {
        mockDashboardData = {
            portfolio: {
                holdings: [{ symbol: 'AAPL', name: 'Apple', shares: 10, avgCost: 100, currentPrice: 114.33, dailyChange: 2, totalPnL: 143.28, dailyPnL: 35 }],
                summary: {
                    totalValue: 1143.28, totalCost: 1000, totalPnL: 143.28, totalPnLPercent: 14.33,
                    todayPnL: 35, todayPnLPercent: 5.16,
                    topContributor: { symbol: 'AAPL', name: 'Apple', dailyPnL: 35 },
                    vix: 13.4,
                },
            },
            watchlist: [],
            positionSymbols: [],
        }

        render(<DashboardContent />)
        expect(screen.getByText(/总盈亏/)).toBeTruthy()
        expect(screen.getByText(/\+\$143\.28/)).toBeTruthy()
    })
})

describe('WatchlistItem position integration', () => {
    const baseProps = {
        id: 'NVDA',
        name: '英伟达',
        price: 780.42,
        chg: 2.4,
        data: [50, 55, 60],
        onClick: mock(() => {}),
        onDeleteRequest: mock(() => {}),
        onDelete: mock(() => {}),
        onDeleteCancel: mock(() => {}),
    }

    it('T06-05: isPosition=true shows position badge', () => {
        render(
            <WatchlistItem {...baseProps} isPosition />,
        )
        expect(screen.getByText('持仓')).toBeTruthy()
    })

    it('T06-06: isPosition=false does not show position badge', () => {
        render(
            <WatchlistItem {...baseProps} isPosition={false} />,
        )
        expect(screen.queryByText('持仓')).toBeNull()
    })

    // T06-07, T06-08: Removed — Radix DropdownMenu Portal doesn't render in happy-dom; cover via E2E

    it('T06-09: isDeleting=true shows DeleteConfirmPopover', () => {
        render(
            <WatchlistItem {...baseProps} isDeleting />,
        )
        expect(screen.getByTestId('delete-confirm-NVDA')).toBeTruthy()
        expect(screen.getByText('确认删除')).toBeTruthy()
    })

    it('T06-10: chg is formatted as +2.40%', () => {
        render(
            <WatchlistItem {...baseProps} />,
        )
        expect(screen.getByText('+2.40%')).toBeTruthy()
    })

    it('T06-11: name === id does not show duplicate name', () => {
        render(
            <WatchlistItem {...baseProps} id='PLTR' name='PLTR' />,
        )
        const allText = screen.getAllByText('PLTR')
        expect(allText.length).toBe(1)
    })
})
