import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { UIMessage } from 'ai'
import type { ReactNode } from 'react'
import type { ChatSession } from '@/components/chat/ChatSessionItem'

const sessions: ChatSession[] = [
    {
        id: 'session-1',
        symbol: 'AAPL',
        title: 'First session',
        createdAt: '2026-04-16T09:00:00.000Z',
        updatedAt: '2026-04-16T12:00:00.000Z',
    },
    {
        id: 'session-2',
        symbol: 'TSLA',
        title: 'Second session',
        createdAt: '2026-04-15T09:00:00.000Z',
        updatedAt: '2026-04-15T12:00:00.000Z',
    },
    {
        id: 'session-3',
        symbol: 'NVDA',
        title: 'Failing session',
        createdAt: '2026-04-14T09:00:00.000Z',
        updatedAt: '2026-04-14T12:00:00.000Z',
    },
]

const mockMutateSessions = mock(() => Promise.resolve(sessions))
const mockSetMessages = mock(() => {})
const mockSendMessage = mock(() => {})
const mockRegenerate = mock(() => {})

let chatMessages: UIMessage[] = []
let chatError: Error | undefined = undefined

mock.module('next/navigation', () => ({
    useRouter: () => ({ replace: mock(() => {}) }),
    useSearchParams: () => ({ get: () => null, toString: () => '' }),
}))

mock.module('swr', () => ({
    __esModule: true,
    default: (key: string) => {
        if (key === '/api/sessions') {
            return {
                data: sessions,
                error: undefined,
                isLoading: false,
                mutate: mockMutateSessions,
            }
        }

        return {
            data: undefined,
            error: undefined,
            isLoading: false,
            mutate: mock(() => {}),
        }
    },
}))

mock.module('@ai-sdk/react', () => ({
    useChat: () => ({
        messages: chatMessages,
        status: chatError ? 'error' : 'ready',
        error: chatError,
        setMessages: mockSetMessages,
        sendMessage: mockSendMessage,
        regenerate: mockRegenerate,
    }),
}))

mock.module('@/components/chat/ChatSessionSidebar', () => ({
    ChatSessionSidebar: ({
        sessions,
        currentSessionId,
        onDeleteSession,
    }: {
        sessions: readonly ChatSession[]
        currentSessionId: string | null
        onDeleteSession: (id: string) => void
    }) => (
        <div>
            <div data-testid='current-session'>{currentSessionId ?? 'none'}</div>
            {sessions.map((session) => (
                <button
                    key={session.id}
                    type='button'
                    onClick={() => onDeleteSession(session.id)}
                >
                    delete-{session.id}
                </button>
            ))}
        </div>
    ),
}))

mock.module('@/components/chat/ChatWelcome', () => ({
    ChatWelcome: ({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) => (
        <button type='button' onClick={() => onSuggestionClick('hello')}>
            welcome
        </button>
    ),
}))

mock.module('@/components/chat/messages/AssistantMessage', () => ({
    AssistantMessage: ({ children }: { children?: ReactNode }) => (
        <div>{children}</div>
    ),
}))

mock.module('@/components/chat/messages/ErrorBanner', () => ({
    ErrorBanner: ({
        error,
        onReload,
    }: {
        error: Error
        onReload: () => void
    }) => (
        <div data-testid='error-banner'>
            <span data-testid='error-message'>{error.message}</span>
            <button
                type='button'
                data-testid='retry-button'
                onClick={onReload}
            >
                retry
            </button>
        </div>
    ),
}))

mock.module('@/components/chat/messages/TruncationNotice', () => ({
    TruncationNotice: () => <div>truncation</div>,
}))

mock.module('@/components/chat/messages/UserMessage', () => ({
    UserMessage: ({ content }: { content?: string }) => <div>{content}</div>,
}))

const fetchMock = mock((input: string | URL, init?: RequestInit) => {
    const url = String(input)

    if (url === '/api/sessions/session-1/messages') {
        return Promise.resolve({
            json: () =>
                Promise.resolve({
                    success: true,
                    data: { messages: [], error: null },
                }),
        })
    }

    if (url === '/api/sessions/session-2/messages') {
        return Promise.resolve({
            json: () =>
                Promise.resolve({
                    success: true,
                    data: {
                        messages: [
                            {
                                id: 'message-2',
                                role: 'user',
                                parts: [
                                    { type: 'text', text: 'hello from session 2' },
                                ],
                            },
                        ],
                        error: null,
                    },
                }),
        })
    }

    if (url === '/api/sessions/session-3/messages') {
        return Promise.resolve({
            json: () =>
                Promise.resolve({
                    success: true,
                    data: {
                        messages: [
                            {
                                id: 'message-3',
                                role: 'user',
                                parts: [{ type: 'text', text: 'what is NVDA?' }],
                            },
                        ],
                        error: {
                            message: 'rate limited',
                            name: 'RateLimitError',
                            code: 'RATE',
                        },
                    },
                }),
        })
    }

    if (url === '/api/sessions/session-1' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true })
    }

    throw new Error(`Unexpected fetch: ${url}`)
})

const { ChatPage } = await import('@/components/chat/ChatPage')

describe('ChatPage', () => {
    beforeEach(() => {
        cleanup()
        chatMessages = []
        chatError = undefined
        mockMutateSessions.mockClear()
        mockSetMessages.mockClear()
        mockSendMessage.mockClear()
        mockRegenerate.mockClear()
        fetchMock.mockClear()
        global.fetch = fetchMock as typeof fetch
    })

    afterEach(() => {
        cleanup()
        mock.restore()
    })

    it('selects the next session after deleting the active session', async () => {
        render(<ChatPage />)

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-1',
            ),
        )

        fireEvent.click(screen.getByText('delete-session-1'))

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-2',
            ),
        )

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/sessions/session-2/messages',
                expect.anything(),
            ),
        )
    })

    it('retry forwards sessionId in regenerate body (Fix 1 regression guard)', async () => {
        // Simulate a live error from useChat
        chatError = new Error('stream failed')
        // Non-empty messages so the error branch renders (ChatWelcome shows when empty)
        chatMessages = [
            {
                id: 'msg-u1',
                role: 'user',
                parts: [{ type: 'text', text: 'hi' }],
            } as UIMessage,
        ]

        render(<ChatPage />)

        // Wait for initial session restore
        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-1',
            ),
        )

        fireEvent.click(screen.getByTestId('retry-button'))

        expect(mockRegenerate).toHaveBeenCalledTimes(1)
        const arg = mockRegenerate.mock.calls[0]?.[0] as
            | { body?: { sessionId?: string | null; symbol?: string | null } }
            | undefined
        expect(arg?.body?.sessionId).toBe('session-1')
    })

    it('renders ErrorBanner from persistedError when session has a stored error (Fix 2)', async () => {
        // Provide a user message so the banner-rendering branch renders
        // (ChatWelcome replaces the message list when empty).
        chatMessages = [
            {
                id: 'message-1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            } as UIMessage,
        ]

        // Override fetch for session-1 to return the new {messages,error} shape
        // with a persisted error, keeping all other routes intact.
        fetchMock.mockImplementationOnce(((input: string | URL) => {
            const url = String(input)
            if (url === '/api/sessions/session-1/messages') {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            success: true,
                            data: {
                                messages: chatMessages,
                                error: {
                                    message: 'rate limited',
                                    name: 'RateLimitError',
                                    code: 'RATE',
                                },
                            },
                        }),
                })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetchMock)

        render(<ChatPage />)

        // Wait for session restore + persistedError to populate + ErrorBanner to render
        const banner = await screen.findByTestId('error-banner')
        expect(banner).toBeDefined()
        expect(screen.getByTestId('error-message').textContent).toBe(
            'rate limited',
        )
    })
})
