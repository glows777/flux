import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RunTraceSummaryStrip } from '@/components/chat/messages/RunTraceSummaryStrip'
import type { RunTraceState } from '@/lib/ai/run-trace-visibility'

const readyState: RunTraceState = {
    status: 'ready',
    record: {
        run: {
            id: 'run-92',
            status: 'completed',
            startedAt: '2026-05-11T00:00:00.000Z',
            finishedAt: null,
        },
        trace: {
            version: 1,
            runId: 'run-92',
            traceStatus: 'complete',
            runOutcome: 'succeeded',
            currentPhase: 'after_run',
            completedPhases: ['created', 'after_run'],
            updatedAt: '2026-05-11T00:00:00.000Z',
            prompt: {
                totalEstimatedInputTokens: 1240,
                finalInput: {
                    systemText: '',
                    modelMessages: [],
                    tools: [
                        { name: 'webSearch', sourcePlugin: 'research' },
                        { name: 'quoteLookup', sourcePlugin: 'market' },
                    ],
                    params: { candidates: [], resolved: {} },
                },
                segments: [
                    {
                        id: 'system-1',
                        target: 'system',
                        kind: 'system.base',
                        sourcePlugin: 'prompt',
                        finalOrder: 0,
                        content: { format: 'text', text: 'Base prompt' },
                        contentHash: 'hash-system',
                        cacheability: 'stable',
                        compactability: 'preserve',
                    },
                    {
                        id: 'recent-1',
                        target: 'messages',
                        kind: 'history.recent',
                        sourcePlugin: 'session',
                        messageIds: ['user-1'],
                        messageCount: 1,
                        roles: ['user'],
                        contentHash: 'hash-recent',
                        cacheability: 'session',
                        compactability: 'summarize',
                    },
                ],
            },
        },
    },
}

afterEach(() => cleanup())

describe('RunTraceSummaryStrip', () => {
    it('renders trace chips, counts, and the view action', () => {
        const onOpen = mock(() => {})
        render(
            <RunTraceSummaryStrip
                state={readyState}
                isSelected={false}
                onOpen={onOpen}
                actionLabel='assistant message 2'
            />,
        )

        expect(screen.getByText('2 tools')).toBeDefined()
        expect(screen.getByText('2 segments')).toBeDefined()
        expect(
            screen.getByText('Trace complete · succeeded · ~1.2k input'),
        ).toBeDefined()

        fireEvent.click(
            screen.getByRole('button', {
                name: 'View trace for assistant message 2',
            }),
        )
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('uses selected trace action labels', () => {
        render(
            <RunTraceSummaryStrip
                state={readyState}
                isSelected={true}
                onOpen={() => {}}
                actionLabel='assistant message 2'
            />,
        )

        const button = screen.getByRole('button', {
            name: 'Viewing trace for assistant message 2',
        })
        expect(button.getAttribute('aria-pressed')).toBe('true')
    })

    it('routes error state to retry with trace wording', () => {
        const onRetry = mock(() => {})
        render(
            <RunTraceSummaryStrip
                state={{ status: 'error', error: 'boom' }}
                isSelected={false}
                onOpen={() => {}}
                onRetry={onRetry}
                actionLabel='assistant message 4'
            />,
        )

        fireEvent.click(
            screen.getByRole('button', {
                name: 'Retry loading trace for assistant message 4',
            }),
        )
        expect(onRetry).toHaveBeenCalledTimes(1)
    })
})
