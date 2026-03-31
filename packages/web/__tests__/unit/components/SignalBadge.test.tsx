import { describe, expect, it } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { SignalBadge } from '@/components/ui/SignalBadge'

describe('SignalBadge', () => {
    it('renders signal text correctly', () => {
        render(<SignalBadge signal='看涨' />)
        expect(screen.getByText('看涨')).toBeTruthy()
    })

    it('applies emerald styles for bullish signals', () => {
        const { container } = render(<SignalBadge signal='强力看涨' />)
        const badge = container.firstChild as HTMLElement
        expect(badge.className).toContain('text-emerald-400')
    })

    it('applies amber styles for volatile signals', () => {
        const { container } = render(<SignalBadge signal='高波动' />)
        const badge = container.firstChild as HTMLElement
        expect(badge.className).toContain('text-amber-400')
    })

    it('applies slate styles for unknown signals', () => {
        const { container } = render(<SignalBadge signal='未知信号' />)
        const badge = container.firstChild as HTMLElement
        expect(badge.className).toContain('text-slate-400')
    })
})
