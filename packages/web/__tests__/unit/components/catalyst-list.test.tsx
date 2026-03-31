/**
 * Task 10: CatalystList Unit Tests
 * 6 test cases — render items, symbol+event, date+days, empty=null, title, footer note
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import type { CatalystItem } from '@flux/shared'

const { CatalystList } = await import(
    '@/components/dashboard/brief/CatalystList'
)

afterEach(cleanup)

const items: CatalystItem[] = [
    { symbol: 'AAPL', name: 'Apple', event: 'Q1 财报', date: '2/27', daysAway: 6 },
    { symbol: 'MSFT', name: 'Microsoft', event: 'Q2 财报', date: '3/05', daysAway: 12 },
    { symbol: 'TSLA', name: 'Tesla', event: 'Q4 财报', date: '3/08', daysAway: 15 },
]

describe('CatalystList', () => {
    it('T10-01: renders 3 items for 3 entries', () => {
        render(<CatalystList items={items} />)
        expect(screen.getByText('AAPL')).toBeTruthy()
        expect(screen.getByText('MSFT')).toBeTruthy()
        expect(screen.getByText('TSLA')).toBeTruthy()
    })

    it('T10-02: displays symbol and event name', () => {
        render(<CatalystList items={items} />)
        expect(screen.getByText('AAPL')).toBeTruthy()
        expect(screen.getByText('Q1 财报')).toBeTruthy()
    })

    it('T10-03: displays date and days away', () => {
        render(<CatalystList items={items} />)
        expect(screen.getByText('2/27')).toBeTruthy()
        expect(screen.getByText('6 天后')).toBeTruthy()
    })

    it('T10-04: returns null for empty array', () => {
        const { container } = render(<CatalystList items={[]} />)
        expect(container.innerHTML).toBe('')
    })

    it('T10-05: renders title text', () => {
        render(<CatalystList items={items} />)
        expect(screen.getByText('近期催化剂')).toBeTruthy()
    })

    it('T10-06: renders footer note', () => {
        render(<CatalystList items={items} />)
        expect(screen.getByText('仅显示已有缓存数据')).toBeTruthy()
    })
})
