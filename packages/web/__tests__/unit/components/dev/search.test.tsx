import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

const { SearchBar } = await import('@/components/dev/SearchBar')
const { SearchResultCard } = await import('@/components/dev/SearchResultCard')

afterEach(() => {
    cleanup()
})

describe('SearchBar', () => {
    it('calls onSearch with query on submit', () => {
        const onSearch = mock(() => {})
        render(<SearchBar onSearch={onSearch} />)

        const queryInput = screen.getByPlaceholderText(/搜索/i)
        fireEvent.change(queryInput, { target: { value: 'test' } })

        const form = queryInput.closest('form')!
        fireEvent.submit(form)

        expect(onSearch).toHaveBeenCalledWith({ q: 'test' })
    })

    it('includes symbol when provided', () => {
        const onSearch = mock(() => {})
        render(<SearchBar onSearch={onSearch} />)

        const queryInput = screen.getByPlaceholderText(/搜索/i)
        fireEvent.change(queryInput, { target: { value: 'earnings' } })

        const symbolInput = screen.getByPlaceholderText(/symbol/i)
        fireEvent.change(symbolInput, { target: { value: 'aapl' } })

        const form = queryInput.closest('form')!
        fireEvent.submit(form)

        expect(onSearch).toHaveBeenCalledWith({ q: 'earnings', symbol: 'AAPL' })
    })

    it('does not call onSearch when query is empty', () => {
        const onSearch = mock(() => {})
        render(<SearchBar onSearch={onSearch} />)

        const form = screen.getByPlaceholderText(/搜索/i).closest('form')!
        fireEvent.submit(form)

        expect(onSearch).not.toHaveBeenCalled()
    })

    it('uppercases symbol input', () => {
        const onSearch = mock(() => {})
        render(<SearchBar onSearch={onSearch} />)

        const symbolInput = screen.getByPlaceholderText(/symbol/i) as HTMLInputElement
        fireEvent.change(symbolInput, { target: { value: 'aapl' } })

        expect(symbolInput.value).toBe('AAPL')
    })
})

describe('SearchResultCard', () => {
    it('renders docPath and score', () => {
        render(
            <SearchResultCard
                docPath='portfolio.md'
                content='Some content'
                score={0.92}
                entities={[]}
                onNavigate={() => {}}
            />,
        )
        expect(screen.getByText('portfolio.md')).toBeTruthy()
        expect(screen.getByText('0.92')).toBeTruthy()
    })

    it('renders entities as pills', () => {
        render(
            <SearchResultCard
                docPath='test.md'
                content='content'
                score={0.5}
                entities={['AAPL', 'Apple']}
                onNavigate={() => {}}
            />,
        )
        expect(screen.getByText('AAPL')).toBeTruthy()
        expect(screen.getByText('Apple')).toBeTruthy()
    })

    it('calls onNavigate when "查看" clicked', () => {
        const onNavigate = mock(() => {})
        render(
            <SearchResultCard
                docPath='test.md'
                content='content'
                score={0.5}
                entities={[]}
                onNavigate={onNavigate}
            />,
        )
        const navBtn = screen.getByRole('button', { name: /查看/i })
        fireEvent.click(navBtn)
        expect(onNavigate).toHaveBeenCalledTimes(1)
    })
})
