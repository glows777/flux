/**
 * Task 04: StatsGrid + StatCard Unit Tests
 * 6 test cases
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

const { StatsGrid } = await import('@/components/dashboard/StatsGrid')
const { StatCard } = await import('@/components/dashboard/StatCard')

afterEach(() => {
    cleanup()
})

describe('StatsGrid', () => {
    const fullSummary = {
        totalValue: 10000,
        totalCost: 8000,
        totalPnL: 2000,
        totalPnLPercent: 25,
        todayPnL: 150,
        todayPnLPercent: 1.5,
        topContributor: { symbol: 'AAPL', name: 'Apple', dailyPnL: 100 },
        vix: 13.4,
    } as const

    it('T04-01: renders 3 cards with correct values when data present', () => {
        render(<StatsGrid data={fullSummary} />)

        expect(screen.getByText('$10,000.00')).toBeTruthy()
        expect(screen.getByText('+$150.00')).toBeTruthy()
        expect(screen.getByText('13/100')).toBeTruthy()

        expect(screen.getByText('今日 +1.50%')).toBeTruthy()
        expect(screen.getByText('主要收益来自Apple')).toBeTruthy()
        expect(screen.getByText('低波动状态')).toBeTruthy()
    })

    it('T04-02: empty portfolio shows zero state text', () => {
        const emptySummary = {
            totalValue: 0,
            totalCost: 0,
            totalPnL: 0,
            totalPnLPercent: 0,
            todayPnL: 0,
            todayPnLPercent: 0,
            topContributor: null,
            vix: 13.4,
        } as const

        render(<StatsGrid data={emptySummary} />)

        expect(screen.getByText('$0.00')).toBeTruthy()
        expect(screen.getByText('添加持仓开始追踪')).toBeTruthy()
    })

    it('T04-04: positive todayPnL shows emerald, negative shows rose', () => {
        const { container: posContainer } = render(
            <StatsGrid data={fullSummary} />,
        )
        const posEmeralds = posContainer.querySelectorAll('[class*="emerald"]')
        expect(posEmeralds.length).toBeGreaterThan(0)

        cleanup()

        const negSummary = {
            ...fullSummary,
            todayPnL: -200,
            todayPnLPercent: -2.0,
            topContributor: { symbol: 'TSLA', name: 'Tesla', dailyPnL: -150 },
        } as const

        const { container: negContainer } = render(
            <StatsGrid data={negSummary} />,
        )
        const negRoses = negContainer.querySelectorAll('[class*="rose"]')
        expect(negRoses.length).toBeGreaterThan(0)
    })

    it('T04-05: VIX labels for different ranges', () => {
        const makeSummary = (vix: number) => ({ ...fullSummary, vix })

        const { unmount: u1 } = render(<StatsGrid data={makeSummary(10)} />)
        expect(screen.getByText('低波动状态')).toBeTruthy()
        u1()

        const { unmount: u2 } = render(<StatsGrid data={makeSummary(20)} />)
        expect(screen.getByText('中等波动')).toBeTruthy()
        u2()

        const { unmount: u3 } = render(<StatsGrid data={makeSummary(30)} />)
        expect(screen.getByText('高波动状态')).toBeTruthy()
        u3()

        const { unmount: u4 } = render(<StatsGrid data={makeSummary(40)} />)
        expect(screen.getByText('极端波动')).toBeTruthy()
        u4()
    })
})

describe('StatCard', () => {
    it('T04-06: renders sub prop text correctly', () => {
        render(<StatCard label='Test' value='$100' sub='自定义副标题' />)
        expect(screen.getByText('自定义副标题')).toBeTruthy()
    })

    it('T04-07: active state shows pulse indicator', () => {
        const { container: activeContainer } = render(
            <StatCard label='Test' value='$100' sub='sub' active />,
        )
        expect(activeContainer.querySelector('.animate-pulse')).toBeTruthy()

        cleanup()

        const { container: inactiveContainer } = render(
            <StatCard label='Test' value='$100' sub='sub' active={false} />,
        )
        expect(inactiveContainer.querySelector('.animate-pulse')).toBeNull()
    })
})
