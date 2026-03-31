/**
 * Task 08: BriefSkeleton Unit Tests
 * 3 test cases — render, animate-pulse, snapshot
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render } from '@testing-library/react'

const { BriefSkeleton } = await import(
    '@/components/dashboard/brief/BriefSkeleton'
)

afterEach(() => {
    cleanup()
})

describe('BriefSkeleton', () => {
    it('T08-01: renders without throwing', () => {
        expect(() => render(<BriefSkeleton />)).not.toThrow()
    })

    it('T08-02: contains animate-pulse elements', () => {
        const { container } = render(<BriefSkeleton />)
        const pulseElements = container.querySelectorAll('.animate-pulse')
        expect(pulseElements.length).toBeGreaterThan(0)
    })

    it('T08-03: snapshot matches structure', () => {
        const { container } = render(<BriefSkeleton />)
        expect(container.innerHTML).toMatchSnapshot()
    })
})
