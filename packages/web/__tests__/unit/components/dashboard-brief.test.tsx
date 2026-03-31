/**
 * Task 11: DashboardContent Morning Brief Integration Tests
 * 16 test cases — loading, macro subtitle, signal badge, expand/collapse,
 *                 layout, refresh, empty state, error degradation
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
    CatalystItem,
    MorningBrief,
    SpotlightItem,
} from '@flux/shared'

// ─── Icon stubs ───
const IconStub = (props: Record<string, unknown>) => <span {...props} />

mock.module('lucide-react', () => ({
    Sparkles: IconStub,
    Radio: IconStub,
    RefreshCw: IconStub,
    ChevronRight: IconStub,
    X: IconStub,
    Plus: IconStub,
    Settings: IconStub,
    Briefcase: IconStub,
    Check: IconStub,
    Loader2: IconStub,
    Pencil: IconStub,
    Trash2: IconStub,
    Ellipsis: IconStub,
    ArrowRight: IconStub,
}))

// ─── Child component stubs ───
mock.module('@/components/dashboard/brief/SpotlightCard', () => ({
    SpotlightCard: ({ item }: { item: SpotlightItem }) => (
        <div data-testid={`spotlight-${item.symbol}`}>{item.symbol}</div>
    ),
}))

mock.module('@/components/dashboard/brief/CatalystList', () => ({
    CatalystList: ({ items }: { items: CatalystItem[] }) => (
        <div data-testid="catalyst-list">{items.length} catalysts</div>
    ),
}))

mock.module('@/components/dashboard/brief/BriefSkeleton', () => ({
    BriefSkeleton: () => (
        <div data-testid="brief-skeleton">Brief loading...</div>
    ),
}))

const showToastMock = mock(() => {})
mock.module('@/components/ui/Toast', () => ({
    showToast: showToastMock,
}))

mock.module('next/navigation', () => ({
    useRouter: () => ({ push: mock(() => {}) }),
    useSearchParams: () => ({ get: () => null }),
}))

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

// ─── SWR state ───
const mockMutateDashboard = mock(() => Promise.resolve())

let mockDashboardData: unknown = undefined
let mockDashboardLoading = false
let mockDashboardError: Error | undefined

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
        return {
            data: undefined,
            isLoading: false,
            error: undefined,
            mutate: mock(() => {}),
        }
    },
}))

mock.module('@/lib/fetcher', () => ({
    fetcher: mock(() => Promise.resolve({})),
}))

// ─── Test data helpers ───
function makeSpotlight(symbol: string, i: number): SpotlightItem {
    return {
        symbol,
        name: `${symbol} Inc`,
        price: 100 + i * 50,
        change: i % 2 === 0 ? 2.3 : -1.5,
        holding: { shares: 100, avgCost: 80 + i * 40, gainPct: 25 },
        reason: `Reason ${symbol}`,
        action: `Action ${symbol}`,
        signal: 'bullish',
    }
}

const defaultPortfolio = {
    holdings: [
        {
            symbol: 'NVDA',
            name: 'NVIDIA',
            shares: 100,
            avgCost: 583.6,
            currentPrice: 875.4,
            dailyChange: 2.3,
            totalPnL: 29180,
            dailyPnL: 2015,
        },
    ],
    summary: {
        totalValue: 87540,
        totalCost: 58360,
        totalPnL: 29180,
        totalPnLPercent: 50,
        todayPnL: 2015,
        todayPnLPercent: 2.36,
        topContributor: { symbol: 'NVDA', name: 'NVIDIA', dailyPnL: 2015 },
        vix: 18,
    },
}

const fiveSpotlight: SpotlightItem[] = [
    'NVDA',
    'AAPL',
    'MSFT',
    'GOOG',
    'TSLA',
].map((s, i) => makeSpotlight(s, i))

const twoCatalysts: CatalystItem[] = [
    {
        symbol: 'NVDA',
        name: 'NVIDIA',
        event: 'GTC 大会',
        date: '2026-03-15',
        daysAway: 13,
    },
    {
        symbol: 'AAPL',
        name: 'Apple',
        event: 'Q2 财报',
        date: '2026-04-25',
        daysAway: 54,
    },
]

const fullBrief: MorningBrief = {
    generatedAt: '2026-02-21T01:00:00Z',
    macro: {
        summary: '美债 4.09%，VIX 18 低位，市场 risk-on 态势，成长股有支撑。',
        signal: 'risk-on',
        keyMetrics: [],
    },
    spotlight: fiveSpotlight,
    catalysts: twoCatalysts,
}

// ─── Dashboard data helper ───
function makeDashboardData(brief: MorningBrief, portfolio = defaultPortfolio) {
    return { portfolio, watchlist: [] as unknown[], brief, positionSymbols: [] as string[] }
}

// ─── Import after mocks ───
const { DashboardContent } = await import(
    '@/components/dashboard/DashboardContent'
)

afterEach(() => {
    cleanup()
    mockDashboardData = undefined
    mockDashboardLoading = false
    mockDashboardError = undefined
    mockMutateDashboard.mockClear()
    showToastMock.mockClear()
})

describe('DashboardContent — Morning Brief', () => {
    it('T11-01: dashboardLoading shows BriefSkeleton', () => {
        mockDashboardLoading = true
        render(<DashboardContent />)
        expect(screen.getByTestId('brief-skeleton')).toBeTruthy()
    })

    it('T11-02: macro.summary renders in subtitle', () => {
        mockDashboardData = makeDashboardData(fullBrief)
        render(<DashboardContent />)
        expect(screen.getByText(/美债 4\.09%/)).toBeTruthy()
    })

    it('T11-03: risk-on signal pill has emerald classes', () => {
        mockDashboardData = makeDashboardData(fullBrief)
        render(<DashboardContent />)
        const pill = screen.getByText('risk-on')
        expect(pill.className).toContain('text-emerald-400')
        expect(pill.className).toContain('bg-emerald-500/10')
    })

    it('T11-04: risk-off signal pill has rose classes', () => {
        mockDashboardData = makeDashboardData({
            ...fullBrief,
            macro: {
                ...fullBrief.macro,
                summary: '市场 risk-off 避险情绪浓厚。',
                signal: 'risk-off',
            },
        })
        render(<DashboardContent />)
        const pill = screen.getByText('risk-off')
        expect(pill.className).toContain('text-rose-400')
    })

    it('T11-05: 5 spotlight items only shows top 3', () => {
        mockDashboardData = makeDashboardData(fullBrief)
        render(<DashboardContent />)
        expect(screen.getByTestId('spotlight-NVDA')).toBeTruthy()
        expect(screen.getByTestId('spotlight-AAPL')).toBeTruthy()
        expect(screen.getByTestId('spotlight-MSFT')).toBeTruthy()
        expect(screen.queryByTestId('spotlight-GOOG')).toBeNull()
        expect(screen.queryByTestId('spotlight-TSLA')).toBeNull()
    })

    it('T11-06: expand button shows "查看全部 5 只持仓 ▾"', () => {
        mockDashboardData = makeDashboardData(fullBrief)
        render(<DashboardContent />)
        expect(screen.getByText('查看全部 5 只持仓 ▾')).toBeTruthy()
    })

    it('T11-07: clicking expand shows all 5 + shows "收起 ▴"', () => {
        mockDashboardData = makeDashboardData(fullBrief)
        render(<DashboardContent />)
        fireEvent.click(screen.getByText('查看全部 5 只持仓 ▾'))
        expect(screen.getByTestId('spotlight-GOOG')).toBeTruthy()
        expect(screen.getByTestId('spotlight-TSLA')).toBeTruthy()
        expect(screen.getByText('收起 ▴')).toBeTruthy()
    })

    it('T11-08: catalysts present → col-span-8 + col-span-4', () => {
        mockDashboardData = makeDashboardData(fullBrief)
        const { container } = render(<DashboardContent />)
        const spotlightCol = container.querySelector(
            '[data-testid="spotlight-column"]',
        )
        const catalystCol = container.querySelector(
            '[data-testid="catalyst-column"]',
        )
        expect(spotlightCol?.className).toContain('md:col-span-8')
        expect(catalystCol?.className).toContain('md:col-span-4')
    })

    it('T11-09: no catalysts → spotlight col-span-12', () => {
        mockDashboardData = makeDashboardData({ ...fullBrief, catalysts: [] })
        const { container } = render(<DashboardContent />)
        const spotlightCol = container.querySelector(
            '[data-testid="spotlight-column"]',
        )
        expect(spotlightCol?.className).toContain('md:col-span-12')
        expect(
            container.querySelector('[data-testid="catalyst-column"]'),
        ).toBeNull()
    })

    it('T11-10: refresh button triggers POST /api/brief', () => {
        mockDashboardData = makeDashboardData(fullBrief)
        const origFetch = globalThis.fetch
        const fetchSpy = mock(() =>
            Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({ success: true, data: fullBrief }),
            } as Response),
        )
        globalThis.fetch = fetchSpy as unknown as typeof fetch

        render(<DashboardContent />)
        fireEvent.click(screen.getByTestId('brief-refresh'))

        expect(fetchSpy).toHaveBeenCalledWith('/api/brief', { method: 'POST' })
        globalThis.fetch = origFetch
    })

    it('T11-11: empty spotlight shows Alpaca guidance text', () => {
        mockDashboardData = makeDashboardData({ ...fullBrief, spotlight: [] })
        render(<DashboardContent />)
        expect(
            screen.getByText('连接 Alpaca 账户后即可生成持仓分析'),
        ).toBeTruthy()
    })

    it('T11-13: dashboard error falls back to hardcoded subtitle', () => {
        mockDashboardError = new Error('fetch failed')
        render(<DashboardContent />)
        expect(screen.getByText(/吸筹蓄势/)).toBeTruthy()
        expect(screen.queryByTestId('brief-skeleton')).toBeNull()
        expect(screen.queryByTestId('brief-refresh')).toBeNull()
        expect(screen.queryByTestId('spotlight-NVDA')).toBeNull()
        expect(screen.getByText('总资产组合')).toBeTruthy()
    })

    it('T11-14: neutral signal pill has slate classes', () => {
        mockDashboardData = makeDashboardData({
            ...fullBrief,
            macro: {
                ...fullBrief.macro,
                summary: '市场 neutral 观望情绪。',
                signal: 'neutral',
            },
        })
        render(<DashboardContent />)
        const pill = screen.getByText('neutral')
        expect(pill.className).toContain('text-slate-400')
        expect(pill.className).toContain('bg-white/5')
    })

    it('T11-15: refresh failure shows toast', async () => {
        mockDashboardData = makeDashboardData(fullBrief)
        const origFetch = globalThis.fetch
        globalThis.fetch = mock(() =>
            Promise.reject(new Error('Network error')),
        ) as unknown as typeof fetch

        render(<DashboardContent />)
        fireEvent.click(screen.getByTestId('brief-refresh'))

        // Wait for the async handler to settle
        await new Promise((r) => setTimeout(r, 10))

        expect(showToastMock).toHaveBeenCalledWith('刷新失败，请稍后再试')
        globalThis.fetch = origFetch
    })

    it('T11-16: collapse after expand returns to top 3', () => {
        mockDashboardData = makeDashboardData(fullBrief)
        render(<DashboardContent />)

        // Expand
        fireEvent.click(screen.getByText('查看全部 5 只持仓 ▾'))
        expect(screen.getByTestId('spotlight-TSLA')).toBeTruthy()

        // Collapse
        fireEvent.click(screen.getByText('收起 ▴'))
        expect(screen.queryByTestId('spotlight-GOOG')).toBeNull()
        expect(screen.queryByTestId('spotlight-TSLA')).toBeNull()
        expect(screen.getByTestId('spotlight-NVDA')).toBeTruthy()
    })
})
