import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ToolTimeline } from '@/components/chat/messages/ToolTimeline'
import type { TimelineStep } from '@/lib/ai/tool-timeline'

afterEach(() => {
    cleanup()
})

const doneStep: TimelineStep = {
    type: 'tool',
    toolName: 'getQuote',
    state: 'done',
    input: { symbol: 'AAPL' },
    output: { price: 100 },
    partIndex: 0,
}

const runningStep: TimelineStep = {
    type: 'tool',
    toolName: 'getQuote',
    state: 'running',
    input: { symbol: 'AAPL' },
    partIndex: 1,
}

describe('ToolTimeline', () => {
    it('shows summary bar with buildTimelineSummary text', () => {
        const { getByText } = render(
            <ToolTimeline steps={[doneStep]} defaultCollapsed={true} />,
        )
        expect(getByText(/查询了 AAPL 报价/)).toBeTruthy()
    })

    it('hides steps when collapsed', () => {
        const { queryByText } = render(
            <ToolTimeline steps={[doneStep]} defaultCollapsed={true} />,
        )
        // The "Done" marker should not be visible when collapsed
        expect(queryByText('Done')).toBeNull()
    })

    it('shows steps when expanded', () => {
        const { getByText } = render(
            <ToolTimeline steps={[doneStep]} defaultCollapsed={false} />,
        )
        expect(getByText(/查询 AAPL 报价/)).toBeTruthy()
    })

    it('toggles on summary bar click', () => {
        const { getByTestId, queryByText } = render(
            <ToolTimeline steps={[doneStep]} defaultCollapsed={true} />,
        )
        // Initially collapsed - no Done marker
        expect(queryByText('Done')).toBeNull()

        // Click to expand
        fireEvent.click(getByTestId('timeline-summary'))
        expect(queryByText('Done')).toBeTruthy()
    })

    it('renders Done marker at the end when expanded and all done', () => {
        const { getByText } = render(
            <ToolTimeline steps={[doneStep]} defaultCollapsed={false} />,
        )
        expect(getByText('Done')).toBeTruthy()
    })

    it('does not render Done marker when steps are running', () => {
        const { queryByText } = render(
            <ToolTimeline steps={[runningStep]} defaultCollapsed={false} />,
        )
        expect(queryByText('Done')).toBeNull()
    })
})
