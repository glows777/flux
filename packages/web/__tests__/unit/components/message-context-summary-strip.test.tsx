import { describe, expect, it, mock } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'
import { MessageContextSummaryStrip } from '@/components/chat/messages/MessageContextSummaryStrip'
import type { MessageContextState } from '@/lib/ai/context-visibility'

const readyState: MessageContextState = {
    status: 'ready',
    record: {
        version: 1,
        runId: 'run-92',
        manifest: {
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                defaults: {},
            },
            pluginOutputs: [],
            assembledContext: {
                segments: [
                    {
                        id: 'recent-1',
                        target: 'messages',
                        kind: 'history.recent',
                        payload: {
                            format: 'messages',
                            messages: [
                                {
                                    id: 'user-1',
                                    role: 'user',
                                    parts: [
                                        {
                                            type: 'text',
                                            text: 'Compare NVDA and AMD',
                                        },
                                    ],
                                },
                            ],
                        },
                        source: { plugin: 'session' },
                        priority: 'high',
                        cacheability: 'session',
                        compactability: 'summarize',
                        estimatedTokens: 480,
                    },
                    {
                        id: 'memory-1',
                        target: 'messages',
                        kind: 'memory.long_lived',
                        payload: {
                            format: 'text',
                            text: 'Prefers semiconductor trades',
                        },
                        source: { plugin: 'memory' },
                        priority: 'medium',
                        cacheability: 'stable',
                        compactability: 'summarize',
                        estimatedTokens: 320,
                    },
                    {
                        id: 'runtime-1',
                        target: 'messages',
                        kind: 'live.runtime',
                        payload: {
                            format: 'text',
                            text: 'symbol=NVDA channel=web',
                        },
                        source: { plugin: 'runtime' },
                        priority: 'high',
                        cacheability: 'volatile',
                        compactability: 'trim',
                        estimatedTokens: 180,
                    },
                    {
                        id: 'system-1',
                        target: 'system',
                        kind: 'system.base',
                        payload: {
                            format: 'text',
                            text: 'Base prompt text',
                        },
                        source: { plugin: 'prompt' },
                        priority: 'required',
                        cacheability: 'stable',
                        compactability: 'preserve',
                        estimatedTokens: 220,
                    },
                ],
                systemSegments: [],
                tools: [
                    {
                        name: 'webSearch',
                        definition: { tool: {} },
                        source: 'research',
                        manifestSpec: { description: 'Search the web' },
                    },
                    {
                        name: 'quoteLookup',
                        definition: { tool: {} },
                        source: 'market',
                        manifestSpec: { description: 'Fetch quotes' },
                    },
                ],
                params: { candidates: [], resolved: {} },
                totalEstimatedInputTokens: 1240,
            },
            modelRequest: {
                systemText: '',
                modelMessages: [],
                toolNames: [],
                resolvedParams: {},
                providerOptions: {},
            },
        },
    },
}

describe('MessageContextSummaryStrip', () => {
    it('renders chips, counts, and the view action', () => {
        const onOpen = mock(() => {})
        render(
            <MessageContextSummaryStrip
                state={readyState}
                isSelected={false}
                onOpen={onOpen}
            />,
        )

        expect(screen.getByText('Memory')).toBeDefined()
        expect(screen.getByText('Recent')).toBeDefined()
        expect(screen.getByText('Runtime')).toBeDefined()
        expect(screen.getByText('2 tools')).toBeDefined()
        expect(screen.getByText('4 segments · ~1.2k input')).toBeDefined()

        fireEvent.click(screen.getByRole('button', { name: 'View context' }))
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('shows the selected action label for the active message', () => {
        render(
            <MessageContextSummaryStrip
                state={readyState}
                isSelected={true}
                onOpen={() => {}}
            />,
        )

        expect(screen.getByRole('button', { name: 'Viewing' })).toBeDefined()
        expect(
            screen.getByRole('button', { name: 'Viewing' }).getAttribute(
                'aria-pressed',
            ),
        ).toBe('true')
    })

    it('routes error state to the retry action', () => {
        const onRetry = mock(() => {})
        render(
            <MessageContextSummaryStrip
                state={{ status: 'error', error: 'boom' }}
                isSelected={false}
                onOpen={() => {}}
                onRetry={onRetry}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('disables the retry action when no retry handler exists', () => {
        const onOpen = mock(() => {})
        render(
            <MessageContextSummaryStrip
                state={{ status: 'error', error: 'boom' }}
                isSelected={false}
                onOpen={onOpen}
            />,
        )

        const retryButton = screen.getByRole('button', { name: 'Retry' })
        expect(retryButton.getAttribute('disabled')).toBe('')
        fireEvent.click(retryButton)
        expect(onOpen).toHaveBeenCalledTimes(0)
    })
})
