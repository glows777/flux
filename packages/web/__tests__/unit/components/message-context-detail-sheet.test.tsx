import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import * as React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MessageContextDetailSheet } from '@/components/chat/messages/MessageContextDetailSheet'
import type { MessageContextState } from '@/lib/ai/context-visibility'

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
            pluginOutputs: [
                {
                    plugin: 'memory',
                    output: { slots: ['profile', 'watchlist'] },
                },
            ],
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
                        source: {
                            plugin: 'session',
                            origin: 'recent window',
                        },
                        priority: 'high',
                        cacheability: 'session',
                        compactability: 'summarize',
                        included: true,
                        finalOrder: 1,
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
                        included: false,
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
                        manifestSpec: {
                            description: 'Search the web',
                            inputSchemaSummary: { query: 'string' },
                        },
                        estimatedTokens: 40,
                    },
                ],
                params: {
                    candidates: [
                        { plugin: 'session', key: 'maxSteps', value: 4 },
                    ],
                    resolved: { maxSteps: 4 },
                },
                totalEstimatedInputTokens: 1240,
            },
            modelRequest: {
                systemText: 'Base prompt text',
                modelMessages: [
                    {
                        id: 'request-user-1',
                        role: 'user',
                        parts: [
                            {
                                type: 'text',
                                text: 'Compare NVDA and AMD',
                            },
                        ],
                    },
                ],
                toolNames: ['webSearch'],
                resolvedParams: { maxSteps: 4 },
                maxOutputTokens: 512,
                providerOptions: { openai: { reasoning: 'medium' } },
            },
            result: {
                text: 'Final answer',
                responseMessage: {
                    id: 'assistant-1',
                    role: 'assistant',
                    parts: [{ type: 'text', text: 'Final answer' }],
                },
                toolCalls: [],
                usage: { inputTokens: 1240, outputTokens: 280 },
            },
        },
    },
}

afterEach(() => {
    cleanup()
})

beforeEach(() => {
    matchesDesktop = true
    installMatchMediaMock()
})

describe('MessageContextDetailSheet', () => {
    it('renders desktop as a named side pane instead of a dialog', () => {
        render(
            <MessageContextDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                onClose={() => {}}
            />,
        )

        expect(screen.getByText('Context details')).toBeDefined()
        expect(
            screen.queryByRole('dialog', { name: 'Context details' }),
        ).toBeNull()
        expect(
            screen.getByRole('complementary', { name: 'Context details' }),
        ).toBeDefined()
    })

    it('renders the expected section order', () => {
        render(
            <MessageContextDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                onClose={() => {}}
            />,
        )

        const headings = screen
            .getAllByRole('heading', { level: 2 })
            .map((node) => node.textContent)

        expect(headings).toEqual([
            'Overview',
            'Segments',
            'Tools',
            'Request config',
            'Raw inspect',
        ])
    })

    it('renders segment groups by source type with system last', () => {
        render(
            <MessageContextDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                onClose={() => {}}
            />,
        )

        const segmentSection = screen
            .getByRole('heading', { name: 'Segments' })
            .closest('section')
        const headings = within(segmentSection as HTMLElement)
            .getAllByRole('heading', { level: 3 })
            .map((node) => node.textContent)

        expect(headings).toEqual([
            'Recent conversation',
            'Long-lived memory',
            'Runtime context',
            'System',
        ])
    })

    it('uses dialog semantics on narrow screens only', () => {
        matchesDesktop = false
        installMatchMediaMock()

        render(
            <MessageContextDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                onClose={() => {}}
            />,
        )

        expect(
            screen.getByRole('dialog', { name: 'Context details' }),
        ).toBeDefined()
        expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe(
            'true',
        )
        expect(screen.queryByRole('complementary')).toBeNull()
    })

    it('moves focus into the mobile dialog and restores it on close', () => {
        matchesDesktop = false
        installMatchMediaMock()

        function Harness() {
            const [isOpen, setIsOpen] = React.useState(false)

            return (
                <div>
                    <button type='button' onClick={() => setIsOpen(true)}>
                        Open context
                    </button>
                    <MessageContextDetailSheet
                        state={readyState}
                        isOpen={isOpen}
                        messageId='assistant-1'
                        onClose={() => setIsOpen(false)}
                    />
                </div>
            )
        }

        render(<Harness />)

        const openButton = screen.getByRole('button', { name: 'Open context' })
        openButton.focus()
        fireEvent.click(openButton)

        const closeButton = screen.getByRole('button', {
            name: 'Close context details',
        })
        expect(document.activeElement).toBe(closeButton)

        fireEvent.click(closeButton)
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(document.activeElement).toBe(openButton)
    })

    it('shows restored segment metadata in the card body', () => {
        render(
            <MessageContextDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                onClose={() => {}}
            />,
        )

        const recentCard = screen.getByText('recent-1').closest('details')
        const memoryCard = screen.getByText('memory-1').closest('details')

        expect(recentCard).toBeDefined()
        expect(memoryCard).toBeDefined()
        expect(within(recentCard as HTMLElement).getByText('Priority')).toBeDefined()
        expect(
            within(recentCard as HTMLElement).getByText('Cacheability'),
        ).toBeDefined()
        expect(
            within(recentCard as HTMLElement).getByText('Compactability'),
        ).toBeDefined()
        expect(within(recentCard as HTMLElement).getByText('Included')).toBeDefined()
        expect(
            within(recentCard as HTMLElement).getByText('Final order'),
        ).toBeDefined()
        expect(within(recentCard as HTMLElement).getByText('Source')).toBeDefined()
        expect(
            within(recentCard as HTMLElement).getAllByText(
                'session · recent window',
            ).length,
        ).toBeGreaterThanOrEqual(2)
        expect(within(memoryCard as HTMLElement).getByText('Excluded')).toBeDefined()
    })

    it('keeps raw inspect collapsed until opened', () => {
        render(
            <MessageContextDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                onClose={() => {}}
            />,
        )

        const toggle = screen.getByRole('button', { name: 'Open raw inspect' })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByText('System text')).toBeNull()
        fireEvent.click(toggle)
        expect(
            screen
                .getByRole('button', { name: 'Close raw inspect' })
                .getAttribute('aria-expanded'),
        ).toBe('true')
        expect(screen.getByText('System text')).toBeDefined()
        expect(screen.getByText('Input raw messages')).toBeDefined()
        expect(screen.getByText('Request model messages')).toBeDefined()
        expect(screen.getByText('Resolved params candidates')).toBeDefined()
        expect(screen.getAllByText('Tool request context')).toHaveLength(2)
        expect(screen.getByText('Result snapshot')).toBeDefined()
    })

    it('preserves segment disclosure state across rerenders while mounted', () => {
        const { rerender } = render(
            <MessageContextDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                onClose={() => {}}
            />,
        )

        const runtimeCard = screen.getByText('runtime-1').closest('details')
        expect(runtimeCard).toBeDefined()
        expect(runtimeCard?.hasAttribute('open')).toBe(true)

        fireEvent.click(screen.getByText('runtime-1'))
        expect(runtimeCard?.hasAttribute('open')).toBe(false)

        rerender(
            <MessageContextDetailSheet
                state={{
                    ...readyState,
                    record: {
                        ...readyState.record,
                        manifest: {
                            ...readyState.record.manifest,
                            modelRequest: {
                                ...readyState.record.manifest.modelRequest,
                                maxOutputTokens: 1024,
                            },
                        },
                    },
                }}
                isOpen={true}
                messageId='assistant-1'
                onClose={() => {}}
            />,
        )

        expect(
            screen
                .getByText('runtime-1')
                .closest('details')
                ?.hasAttribute('open'),
        ).toBe(false)
    })

    it('restores request diagnostics for advanced debugging', () => {
        render(
            <MessageContextDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                onClose={() => {}}
            />,
        )

        const requestConfig = screen
            .getByRole('heading', { name: 'Request config' })
            .closest('section')

        expect(within(requestConfig as HTMLElement).getByText('Model messages')).toBeDefined()
        expect(within(requestConfig as HTMLElement).getByText('Resolved params')).toBeDefined()
        expect(within(requestConfig as HTMLElement).getByText('Provider options')).toBeDefined()
        expect(within(requestConfig as HTMLElement).getByText('Tool names')).toBeDefined()
        expect(
            within(requestConfig as HTMLElement).getAllByText(/webSearch/).length,
        ).toBeGreaterThanOrEqual(2)
        expect(
            within(requestConfig as HTMLElement).getByText(/"count": 1/),
        ).toBeDefined()
        expect(
            within(requestConfig as HTMLElement).getByText(/"maxSteps": 4/),
        ).toBeDefined()
        expect(
            within(requestConfig as HTMLElement).getByText(/"reasoning": "medium"/),
        ).toBeDefined()
    })

    it('closes the sheet when the close button is pressed', () => {
        const onClose = mock(() => {})
        render(
            <MessageContextDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                onClose={onClose}
            />,
        )

        fireEvent.click(
            screen.getByRole('button', { name: 'Close context details' }),
        )
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes the sheet when escape is pressed', () => {
        const onClose = mock(() => {})
        render(
            <MessageContextDetailSheet
                state={readyState}
                isOpen={true}
                messageId='assistant-1'
                onClose={onClose}
            />,
        )

        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
