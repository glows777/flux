import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from '@testing-library/react'
import * as React from 'react'
import { RunTraceDetailSheet } from '@/components/chat/messages/RunTraceDetailSheet'
import type { RunTraceState } from '@/lib/ai/run-trace-visibility'

let matchesDesktop = true

function installMatchMediaMock() {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mock((query: string) => ({
            matches: query === '(min-width: 768px)' ? matchesDesktop : false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        })),
    })
}

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
            completedPhases: ['created', 'before_run', 'after_run'],
            updatedAt: '2026-05-11T00:00:00.000Z',
            prompt: {
                totalEstimatedInputTokens: 1240,
                finalInput: {
                    systemText: 'Base prompt text',
                    modelMessages: [{ role: 'user', content: 'Compare NVDA' }],
                    tools: [
                        {
                            name: 'webSearch',
                            sourcePlugin: 'research',
                            description: 'Search the web',
                            estimatedTokens: 40,
                        },
                    ],
                    params: { candidates: [], resolved: { maxSteps: 4 } },
                },
                segments: [
                    {
                        id: 'recent-1',
                        target: 'messages',
                        kind: 'history.recent',
                        sourcePlugin: 'session',
                        origin: 'recent window',
                        messageIds: ['user-1', 'assistant-1'],
                        messageCount: 2,
                        roles: ['user', 'assistant'],
                        contentHash: 'hash-recent',
                        cacheability: 'session',
                        compactability: 'summarize',
                    },
                    {
                        id: 'system-1',
                        target: 'system',
                        kind: 'system.base',
                        sourcePlugin: 'prompt',
                        finalOrder: 0,
                        content: { format: 'text', text: 'Base prompt text' },
                        contentHash: 'hash-system',
                        estimatedTokens: 220,
                        cacheability: 'stable',
                        compactability: 'preserve',
                    },
                ],
            },
            cache: {
                plan: {
                    provider: 'anthropic',
                    stableCoreSegmentIds: ['system-1'],
                    cacheableSessionSegmentIds: ['recent-1'],
                    dynamicTailSegmentIds: [],
                    effectivePrefixSegmentIds: ['system-1'],
                    effectivePrefixEstimatedTokens: 220,
                    hashes: {
                        toolDefinitionsHash: 'tools',
                        systemHash: 'system',
                        memoryHash: 'memory',
                        dynamicTailHash: 'tail',
                    },
                    eligibility: {
                        providerSupportsPromptCache: true,
                        prefixAboveThreshold: true,
                        cacheExpected: true,
                        cacheExpectationReason: 'eligible',
                        providerRuleAssumptions: [],
                    },
                },
                providerRequest: {
                    preparedCacheRequest: true,
                    usedCacheRequest: true,
                    providerOptions: {},
                    providerMessages: [],
                    cachedToolNames: ['webSearch'],
                    cachedToolCount: 1,
                    cacheControlBreakpoints: {
                        count: 1,
                        sources: {
                            providerMessages: 1,
                            tools: 0,
                            cachePlan: 0,
                        },
                    },
                },
                result: {
                    cacheObserved: true,
                    evidenceSource: 'both',
                    cacheReadObserved: true,
                    cacheWriteObserved: false,
                    cacheReadEvidenceSource: 'providerMetadata',
                    cacheWriteEvidenceSource: 'none',
                    rolloutGateStatus: 'enabled',
                    circuitBreakerState: 'closed',
                },
            },
            result: {
                finishReason: 'stop',
                finalOutput: { text: 'Final answer', textHash: 'hash-answer' },
                usage: { inputTokens: 1240, outputTokens: 280 },
                provider: { id: 'anthropic', modelId: 'claude-sonnet' },
            },
        },
    },
}

afterEach(() => cleanup())

beforeEach(() => {
    matchesDesktop = true
    installMatchMediaMock()
})

describe('RunTraceDetailSheet', () => {
    it('renders desktop as a named run trace side pane', () => {
        render(
            <RunTraceDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                runId='run-92'
                onClose={() => {}}
            />,
        )

        expect(screen.getByText('Run trace')).toBeDefined()
        expect(screen.getByRole('complementary', { name: 'Run trace' }))
            .toBeDefined
        expect(screen.getByText('Message assistant-1')).toBeDefined()
        expect(screen.getByText('Run run-92')).toBeDefined()
    })

    it('renders the expected trace sections', () => {
        render(
            <RunTraceDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                runId='run-92'
                onClose={() => {}}
            />,
        )

        expect(
            screen
                .getAllByRole('heading', { level: 2 })
                .map((node) => node.textContent),
        ).toEqual([
            'Overview',
            'Segments',
            'Request config',
            'Cache',
            'Result',
            'Raw inspect',
        ])
    })

    it('shows segment trace metadata from prompt segments', () => {
        render(
            <RunTraceDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                runId='run-92'
                onClose={() => {}}
            />,
        )

        const recentCard = screen.getByText('recent-1').closest('details')
        expect(recentCard).toBeDefined()
        expect(within(recentCard as HTMLElement).getByText('Source plugin'))
            .toBeDefined
        expect(
            within(recentCard as HTMLElement).getAllByText('session').length,
        ).toBeGreaterThan(0)
        expect(within(recentCard as HTMLElement).getByText('Message count'))
            .toBeDefined
        expect(within(recentCard as HTMLElement).getByText('hash-recent'))
            .toBeDefined
    })

    it('uses dialog semantics on narrow screens and restores focus', () => {
        matchesDesktop = false
        installMatchMediaMock()

        function Harness() {
            const [isOpen, setIsOpen] = React.useState(false)

            return (
                <div>
                    <button type='button' onClick={() => setIsOpen(true)}>
                        Open trace
                    </button>
                    <RunTraceDetailSheet
                        state={readyState}
                        isOpen={isOpen}
                        messageId='assistant-1'
                        runId='run-92'
                        onClose={() => setIsOpen(false)}
                    />
                </div>
            )
        }

        render(<Harness />)

        const openButton = screen.getByRole('button', { name: 'Open trace' })
        openButton.focus()
        fireEvent.click(openButton)

        const dialog = screen.getByRole('dialog', { name: 'Run trace' })
        expect(dialog.getAttribute('aria-modal')).toBe('true')

        const closeButton = screen.getByRole('button', {
            name: 'Close run trace',
        })
        expect(document.activeElement).toBe(closeButton)

        fireEvent.click(closeButton)
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(document.activeElement).toBe(openButton)
    })
})
