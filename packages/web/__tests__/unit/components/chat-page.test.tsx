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
]

const mockMutateSessions = mock(() => Promise.resolve(sessions))
const mockSetMessages = mock(() => {})
const mockSendMessage = mock(() => {})
const mockRegenerate = mock(() => {})

let chatMessages: UIMessage[] = []

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
        status: 'ready',
        error: undefined,
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

for (const modulePath of [
    '@/components/chat/messages/AssistantMessage',
    '@/components/chat/messages/ErrorBanner',
    '@/components/chat/messages/TruncationNotice',
    '@/components/chat/messages/UserMessage',
]) {
    mock.module(modulePath, () => ({
        AssistantMessage: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
        ErrorBanner: () => <div>error</div>,
        TruncationNotice: () => <div>truncation</div>,
        UserMessage: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    }))
}

const fetchMock = mock((input: string | URL, init?: RequestInit) => {
    const url = String(input)

    if (url === '/api/sessions/session-1/messages') {
        return Promise.resolve({
            json: () => Promise.resolve({ success: true, data: [] }),
        })
    }

    if (url === '/api/sessions/session-2/messages') {
        return Promise.resolve({
            json: () =>
                Promise.resolve({
                    success: true,
                    data: [
                        {
                            id: 'message-2',
                            role: 'user',
                            parts: [{ type: 'text', text: 'hello from session 2' }],
                        },
                    ],
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
})
