/**
 * Task 12: AICortex Tab URL Query Param Tests
 *
 * Verifies that AICortex reads ?tab= from URL search params
 * and initializes the active tab accordingly.
 *
 * T12-01: 默认 tab = report (无 query)
 * T12-03: ?tab=finance → Finance Tab 激活
 * T12-04: ?tab=xxx → fallback 到 Report Tab
 * T12-05: 手动切换 Tab 正常工作
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

// ─── Mock next/navigation ───
let tabParam: string | null = null

mock.module('next/navigation', () => ({
    useSearchParams: () => ({
        get: (key: string) => (key === 'tab' ? tabParam : null),
    }),
    useRouter: () => ({ push: mock(() => {}) }),
}))

mock.module('@/lib/fetcher', () => ({
    fetcher: mock(() => Promise.resolve([])),
}))

const { AICortex } = await import('@/components/detail/AICortex')

afterEach(() => {
    cleanup()
    tabParam = null
})

describe('AICortex tab initialization from URL query param', () => {
    it('T12-01: defaults to report tab when no query param', () => {
        tabParam = null
        render(<AICortex symbol="NVDA" assetName="NVIDIA" />)

        const reportTab = screen.getByText('研报')
        expect(reportTab.closest('button')?.className).toContain('text-emerald')
    })

    it('T12-03: ?tab=finance activates Finance tab', () => {
        tabParam = 'finance'
        render(<AICortex symbol="NVDA" assetName="NVIDIA" />)

        const financeTab = screen.getByText('财报')
        expect(financeTab.closest('button')?.className).toContain('text-emerald')
    })

    it('T12-04: invalid ?tab=xxx falls back to report tab', () => {
        tabParam = 'xxx'
        render(<AICortex symbol="NVDA" assetName="NVIDIA" />)

        const reportTab = screen.getByText('研报')
        expect(reportTab.closest('button')?.className).toContain('text-emerald')
    })

    it('T12-05: manual tab switch works', () => {
        tabParam = 'finance'
        render(<AICortex symbol="NVDA" assetName="NVIDIA" />)

        const financeTab = screen.getByText('财报')
        expect(financeTab.closest('button')?.className).toContain('text-emerald')

        const reportTab = screen.getByText('研报')
        fireEvent.click(reportTab.closest('button')!)

        expect(reportTab.closest('button')?.className).toContain('text-emerald')
        expect(financeTab.closest('button')?.className).not.toContain('text-emerald')
    })

    it('T12-06: ?tab=chat falls back to report (chat tab removed)', () => {
        tabParam = 'chat'
        render(<AICortex symbol="NVDA" assetName="NVIDIA" />)

        const reportTab = screen.getByText('研报')
        expect(reportTab.closest('button')?.className).toContain('text-emerald')
    })
})
