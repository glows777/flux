/**
 * Task 09: SpotlightCard Unit Tests
 * 9 test cases — symbol/price, change colors, gain colors, action colors, reason+action, click, icon
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SpotlightItem } from '@flux/shared'

// Mock lucide-react
mock.module('lucide-react', () => ({
    ArrowRight: (props: Record<string, unknown>) => (
        <span data-testid="arrow-right" {...props} />
    ),
}))

// Mock next/navigation
const pushMock = mock(() => {})
mock.module('next/navigation', () => ({
    useRouter: () => ({ push: pushMock }),
    useSearchParams: () => ({ get: () => null }),
}))

const { SpotlightCard } = await import(
    '@/components/dashboard/brief/SpotlightCard'
)

afterEach(() => {
    cleanup()
    pushMock.mockClear()
})

const bullishItem: SpotlightItem = {
    symbol: 'NVDA',
    name: 'NVIDIA',
    price: 875.4,
    change: 2.3,
    holding: { shares: 100, avgCost: 583.6, gainPct: 50 },
    reason: 'RSI 78 超买，GTC 大会本周五，历史回调 ~3%。',
    action: '考虑减仓 20-30% 锁利润',
    signal: 'bullish',
}

const bearishItem: SpotlightItem = {
    symbol: 'BABA',
    name: 'Alibaba',
    price: 85.2,
    change: -3.1,
    holding: { shares: 200, avgCost: 120, gainPct: -29 },
    reason: '管理层减持，AI 竞争加剧',
    action: '止损离场',
    signal: 'bearish',
}

describe('SpotlightCard', () => {
    it('T09-01: renders symbol and price', () => {
        render(<SpotlightCard item={bullishItem} />)
        expect(screen.getByText('NVDA')).toBeTruthy()
        expect(screen.getByText('$875.40')).toBeTruthy()
    })

    it('T09-02: positive change shows emerald', () => {
        const { container } = render(<SpotlightCard item={bullishItem} />)
        const changeEl = screen.getByText('+2.30%')
        expect(changeEl.className).toContain('text-emerald-400')
    })

    it('T09-03: negative change shows rose', () => {
        render(<SpotlightCard item={bearishItem} />)
        const changeEl = screen.getByText('-3.10%')
        expect(changeEl.className).toContain('text-rose-400')
    })

    it('T09-04: positive gainPct shows emerald', () => {
        render(<SpotlightCard item={bullishItem} />)
        const gainEl = screen.getByText('+50.00%')
        expect(gainEl.className).toContain('text-emerald-400')
    })

    it('T09-05: negative gainPct shows rose', () => {
        render(<SpotlightCard item={bearishItem} />)
        const gainEl = screen.getByText('-29.00%')
        expect(gainEl.className).toContain('text-rose-400')
    })

    it('T09-06: bearish action shows rose', () => {
        render(<SpotlightCard item={bearishItem} />)
        const actionEl = screen.getByText(/→ 止损离场/)
        expect(actionEl.className).toContain('text-rose-400')
    })

    it('T09-07: bullish action shows emerald', () => {
        render(<SpotlightCard item={bullishItem} />)
        const actionEl = screen.getByText(/→ 考虑减仓/)
        expect(actionEl.className).toContain('text-emerald-400')
    })

    it('T09-08: renders reason and action text', () => {
        render(<SpotlightCard item={bullishItem} />)
        expect(
            screen.getByText(bullishItem.reason)
        ).toBeTruthy()
        expect(
            screen.getByText(/考虑减仓 20-30% 锁利润/)
        ).toBeTruthy()
    })

    it('T09-09: click navigates to detail chat tab', () => {
        const { container } = render(<SpotlightCard item={bullishItem} />)
        const card = container.firstElementChild as HTMLElement
        fireEvent.click(card)
        expect(pushMock).toHaveBeenCalledWith('/detail/NVDA?tab=chat')
    })

    it('T09-10: ArrowRight icon is rendered', () => {
        render(<SpotlightCard item={bullishItem} />)
        expect(screen.getByTestId('arrow-right')).toBeTruthy()
    })
})
