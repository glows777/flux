import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import type { UIMessage } from 'ai'
import { MessageContextPanel } from '@/components/chat/messages/MessageContextPanel'
import type {
    MessageContextRecord,
    MessageContextState,
} from '@/lib/ai/context-visibility'
import { fetchMessageContext } from '@/lib/ai/context-visibility'

afterEach(() => {
    cleanup()
})

function buildReadyState(): MessageContextState {
    const baseSegment = {
        id: 'seg-base',
        target: 'system' as const,
        kind: 'system.base' as const,
        payload: { format: 'text' as const, text: 'Base prompt text' },
        source: { plugin: 'prompt' },
        priority: 'required' as const,
        cacheability: 'stable' as const,
        compactability: 'preserve' as const,
        included: true,
        finalOrder: 0,
        estimatedTokens: 42,
    }

    const message: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Raw message content' }],
    }

    const record: MessageContextRecord = {
        version: 1,
        runId: 'run-1',
        manifest: {
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [message],
                initialSessionId: 'session-1',
                resolvedSessionId: 'session-1',
                defaults: { maxSteps: 20 },
            },
            pluginOutputs: [
                {
                    plugin: 'memory',
                    output: {
                        segments: [baseSegment],
                    },
                },
            ],
            assembledContext: {
                segments: [
                    baseSegment,
                    {
                        id: 'seg-history',
                        target: 'messages' as const,
                        kind: 'history.recent' as const,
                        payload: {
                            format: 'messages' as const,
                            messages: [message],
                        },
                        source: { plugin: 'session', origin: 'chat' },
                        priority: 'high' as const,
                        cacheability: 'session' as const,
                        compactability: 'summarize' as const,
                    },
                ],
                systemSegments: [baseSegment],
                tools: [
                    {
                        name: 'webSearch',
                        definition: { tool: {} as never },
                        source: 'research',
                        manifestSpec: {
                            description: 'Search the web',
                        },
                        estimatedTokens: 12,
                    },
                ],
                params: {
                    candidates: [
                        {
                            plugin: 'session',
                            key: 'maxSteps',
                            value: 20,
                        },
                    ],
                    resolved: { maxSteps: 20 },
                },
                totalEstimatedInputTokens: 54,
            },
            modelRequest: {
                systemText: 'Base prompt text',
                modelMessages: [message],
                toolNames: ['webSearch'],
                resolvedParams: { maxSteps: 20 },
                providerOptions: { openai: { reasoning: 'medium' } },
            },
            result: {
                text: 'Final answer',
                responseMessage: {
                    id: 'msg-2',
                    role: 'assistant',
                    parts: [{ type: 'text', text: 'Final answer' }],
                },
                toolCalls: [
                    {
                        toolName: 'webSearch',
                        args: { query: 'AAPL' },
                        result: { results: [] },
                    },
                ],
                usage: {
                    inputTokens: 10,
                    outputTokens: 3,
                },
            },
        },
    }

    return {
        status: 'ready',
        record,
    }
}

describe('MessageContextPanel', () => {
    it('renders the five sections and raw content in ready state', () => {
        const onToggle = mock(() => {})
        const { getByRole } = render(
            <MessageContextPanel
                state={buildReadyState()}
                isOpen={true}
                onToggle={onToggle}
            />,
        )

        const summarySection = getByRole('heading', { name: 'Summary' }).closest('section')
        const assembledSection = getByRole('heading', { name: 'Assembled Context' }).closest('section')
        const pluginSection = getByRole('heading', { name: 'Plugin Outputs' }).closest('section')
        const modelSection = getByRole('heading', { name: 'Model Request' }).closest('section')
        const resultSection = getByRole('heading', { name: 'Result' }).closest('section')

        expect(summarySection).toBeTruthy()
        expect(assembledSection).toBeTruthy()
        expect(pluginSection).toBeTruthy()
        expect(modelSection).toBeTruthy()
        expect(resultSection).toBeTruthy()

        expect(within(assembledSection as HTMLElement).getByText('Base prompt text')).toBeTruthy()
        expect(within(assembledSection as HTMLElement).getByText(/Raw message content/)).toBeTruthy()
        expect(
            within(resultSection as HTMLElement).queryAllByText('Final answer').length,
        ).toBeGreaterThan(0)

        fireEvent.click(getByRole('button', { name: /context ready/i }))
        expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('renders loading and unavailable states cleanly', () => {
        const onToggle = mock(() => {})
        const { getAllByText, rerender } = render(
            <MessageContextPanel
                state={{ status: 'loading' }}
                isOpen={true}
                onToggle={onToggle}
            />,
        )

        expect(getAllByText('Loading context...').length).toBeGreaterThan(0)

        rerender(
            <MessageContextPanel
                state={{ status: 'unavailable' }}
                isOpen={true}
                onToggle={onToggle}
            />,
        )

        expect(getAllByText('Context unavailable').length).toBeGreaterThan(0)
    })

    it('treats a successful null payload as unavailable', async () => {
        const fetchMock = mock(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                    Promise.resolve({
                        success: true,
                        data: null,
                    }),
            }),
        )

        const originalFetch = global.fetch
        global.fetch = fetchMock as typeof fetch

        try {
            const result = await fetchMessageContext('session-1', 'message-1')
            expect(result).toBeNull()
        } finally {
            global.fetch = originalFetch
        }
    })

    it('surfaces a 404 payload error instead of treating it as unavailable', async () => {
        const fetchMock = mock(() =>
            Promise.resolve({
                ok: false,
                status: 404,
                json: () =>
                    Promise.resolve({
                        success: false,
                        error: 'Message not found',
                    }),
            }),
        )

        const originalFetch = global.fetch
        global.fetch = fetchMock as typeof fetch

        try {
            await expect(
                fetchMessageContext('session-1', 'message-1'),
            ).rejects.toThrow('Message not found')
        } finally {
            global.fetch = originalFetch
        }
    })
})
