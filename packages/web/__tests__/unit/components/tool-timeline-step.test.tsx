import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import { ToolFetchLink } from '@/components/chat/messages/ToolFetchLink'
import { ToolMemoryResults } from '@/components/chat/messages/ToolMemoryResults'
import { ToolSearchResults } from '@/components/chat/messages/ToolSearchResults'
import { ToolTimelineStep } from '@/components/chat/messages/ToolTimelineStep'
import type { TimelineStep } from '@/lib/ai/tool-timeline'

afterEach(() => {
    cleanup()
})

describe('ToolSearchResults', () => {
    it('renders source list with titles and domains', () => {
        const sources = [
            {
                title: 'Apple Q1 Earnings',
                url: 'https://seekingalpha.com/article/1',
                score: 0.95,
            },
            {
                title: 'AAPL Analysis',
                url: 'https://finance.yahoo.com/quote/AAPL',
                score: 0.8,
            },
        ]
        const { getByText } = render(<ToolSearchResults sources={sources} />)
        expect(getByText('Apple Q1 Earnings')).toBeTruthy()
        expect(getByText('seekingalpha.com')).toBeTruthy()
        expect(getByText('AAPL Analysis')).toBeTruthy()
        expect(getByText('finance.yahoo.com')).toBeTruthy()
    })

    it('returns null for empty sources', () => {
        const { container } = render(<ToolSearchResults sources={[]} />)
        expect(container.innerHTML).toBe('')
    })

    it('shows "+N more" when sources exceed maxVisible', () => {
        const sources = Array.from({ length: 8 }, (_, i) => ({
            title: `Source ${i}`,
            url: `https://example${i}.com/article`,
            score: 0.9 - i * 0.1,
        }))
        const { getByText } = render(
            <ToolSearchResults sources={sources} maxVisible={5} />,
        )
        expect(getByText('+3 more')).toBeTruthy()
    })
})

describe('ToolMemoryResults', () => {
    it('renders doc list with paths and snippets', () => {
        const results = [
            {
                docPath: 'opinions/AAPL.md',
                content: 'PE偏高但增长强劲',
                score: 0.85,
                entities: [],
            },
            {
                docPath: 'preferences.md',
                content: '偏好成长股',
                score: 0.72,
                entities: [],
            },
        ]
        const { getByText } = render(<ToolMemoryResults results={results} />)
        expect(getByText('AAPL.md')).toBeTruthy()
        expect(getByText(/PE偏高但增长强劲/)).toBeTruthy()
    })

    it('returns null for empty results', () => {
        const { container } = render(<ToolMemoryResults results={[]} />)
        expect(container.innerHTML).toBe('')
    })
})

describe('ToolFetchLink', () => {
    it('renders title, domain, and external link', () => {
        const { getByText, container } = render(
            <ToolFetchLink
                url='https://seekingalpha.com/article/aapl-q1'
                title='Apple Q1 Earnings Report'
            />,
        )
        expect(getByText('Apple Q1 Earnings Report')).toBeTruthy()
        expect(getByText('seekingalpha.com')).toBeTruthy()
        expect(container.querySelector('a[target="_blank"]')).toBeTruthy()
    })

    it('falls back to URL path when no title', () => {
        const { getByText } = render(
            <ToolFetchLink url='https://example.com/page' />,
        )
        expect(getByText('example.com/page')).toBeTruthy()
    })
})

describe('ToolTimelineStep', () => {
    it('renders thinking step with text', () => {
        const step: TimelineStep = {
            type: 'thinking',
            text: 'Let me check the price',
            partIndex: 0,
        }
        const { getByText } = render(<ToolTimelineStep step={step} />)
        expect(getByText('Let me check the price')).toBeTruthy()
    })

    it('renders data tool with loading label and summary', () => {
        const step: TimelineStep = {
            type: 'tool',
            toolName: 'getQuote',
            state: 'done',
            input: { symbol: 'AAPL' },
            output: { price: 182.5, change: 2.35 },
            partIndex: 0,
        }
        const { getByText } = render(<ToolTimelineStep step={step} />)
        expect(getByText(/查询 AAPL 报价/)).toBeTruthy()
        expect(getByText(/\$182\.50/)).toBeTruthy()
    })

    it('renders webSearch with ToolSearchResults', () => {
        const step: TimelineStep = {
            type: 'tool',
            toolName: 'webSearch',
            state: 'done',
            input: { query: 'AAPL earnings' },
            output: {
                report: 'summary',
                sources: [
                    {
                        title: 'Article',
                        url: 'https://example.com',
                        score: 0.9,
                    },
                ],
            },
            partIndex: 0,
        }
        const { getByText } = render(<ToolTimelineStep step={step} />)
        expect(getByText('"AAPL earnings"')).toBeTruthy()
        expect(getByText('Article')).toBeTruthy()
    })

    it('renders error step with error text', () => {
        const step: TimelineStep = {
            type: 'tool',
            toolName: 'getQuote',
            state: 'error',
            errorText: 'API rate limit exceeded',
            partIndex: 0,
        }
        const { getByText } = render(<ToolTimelineStep step={step} />)
        expect(getByText(/API rate limit exceeded/)).toBeTruthy()
    })

    it('renders memory_write as light step', () => {
        const step: TimelineStep = {
            type: 'tool',
            toolName: 'memory_write',
            state: 'done',
            input: { docPath: 'notes/AAPL.md' },
            partIndex: 0,
        }
        const { getByText } = render(<ToolTimelineStep step={step} />)
        expect(getByText(/已保存/)).toBeTruthy()
    })
})
