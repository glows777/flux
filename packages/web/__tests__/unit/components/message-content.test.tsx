import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import type { UIMessage } from 'ai'
import { MessageContent } from '@/components/chat/messages/MessageContent'

afterEach(() => {
    cleanup()
})

describe('MessageContent', () => {
    it('renders text segments as markdown', () => {
        const message = {
            id: '1',
            role: 'assistant' as const,
            parts: [{ type: 'text' as const, text: 'Hello **world**' }],
        } as UIMessage
        const { getByText } = render(<MessageContent message={message} />)
        expect(getByText('world')).toBeTruthy()
    })

    it('renders tool parts inside ToolTimeline', () => {
        const message = {
            id: '1',
            role: 'assistant' as const,
            parts: [
                {
                    type: 'dynamic-tool' as const,
                    toolCallId: 'a',
                    toolName: 'getQuote',
                    state: 'output-available',
                    output: { price: 100, change: 1 },
                    input: { symbol: 'AAPL' },
                },
            ],
        } as UIMessage
        const { getByText } = render(<MessageContent message={message} />)
        expect(getByText(/查询了 AAPL 报价/)).toBeTruthy()
    })

    it('renders display tools as standalone components', () => {
        const message = {
            id: '1',
            role: 'assistant' as const,
            parts: [
                {
                    type: 'dynamic-tool' as const,
                    toolCallId: 'a',
                    toolName: 'display_rating_card',
                    state: 'output-available',
                    output: {
                        symbol: 'AAPL',
                        rating: '买入',
                        confidence: 80,
                        currentPrice: 100,
                        summary: 'test',
                        keyFactors: [],
                    },
                    input: {},
                },
            ],
        } as UIMessage
        const { getByText } = render(<MessageContent message={message} />)
        expect(getByText('AAPL')).toBeTruthy()
        expect(getByText('买入')).toBeTruthy()
    })

    it('text part splits tool parts into separate timelines', () => {
        const message = {
            id: '1',
            role: 'assistant' as const,
            parts: [
                {
                    type: 'dynamic-tool' as const,
                    toolCallId: 'a',
                    toolName: 'getQuote',
                    state: 'output-available',
                    output: { price: 100 },
                    input: { symbol: 'AAPL' },
                },
                { type: 'text' as const, text: 'Here is the data' },
                {
                    type: 'dynamic-tool' as const,
                    toolCallId: 'b',
                    toolName: 'getNews',
                    state: 'output-available',
                    output: [1, 2],
                    input: { symbol: 'AAPL' },
                },
            ],
        } as UIMessage
        const { getAllByTestId, getByText } = render(
            <MessageContent message={message} />,
        )
        const summaryBars = getAllByTestId('timeline-summary')
        expect(summaryBars).toHaveLength(2)
        expect(getByText('Here is the data')).toBeTruthy()
    })
})
