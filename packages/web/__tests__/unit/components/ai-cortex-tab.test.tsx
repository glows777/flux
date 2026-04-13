/**
 * AICortex Component Tests
 *
 * T12-01: renders header "Flux 智能核心"
 * T12-02: renders chat input placeholder with asset name
 * T12-03: no tab bar rendered
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

mock.module('next/navigation', () => ({
    useSearchParams: () => ({ get: () => null }),
    useRouter: () => ({ push: mock(() => {}) }),
}))

mock.module('@/lib/fetcher', () => ({
    fetcher: mock(() => Promise.resolve([])),
}))

const { AICortex } = await import('@/components/detail/AICortex')

afterEach(() => {
    cleanup()
})

describe('AICortex', () => {
    it('T12-01: renders header', () => {
        render(<AICortex symbol='NVDA' assetName='NVIDIA' />)
        expect(screen.getByText('Flux 智能核心')).toBeDefined()
    })

    it('T12-02: renders chat input placeholder with asset name', () => {
        render(<AICortex symbol='NVDA' assetName='NVIDIA' />)
        const input = screen.getByPlaceholderText('询问关于 NVIDIA 的问题...')
        expect(input).toBeDefined()
    })

    it('T12-03: no tab bar rendered', () => {
        render(<AICortex symbol='NVDA' assetName='NVIDIA' />)
        expect(screen.queryByText('研报')).toBeNull()
    })
})
