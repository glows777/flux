import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { UIMessage } from 'ai'
import { useEffect, useState, type ReactNode } from 'react'
import type { ChatSession } from '@/components/chat/ChatSessionItem'

const defaultSessions: ChatSession[] = [
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

let sessions: ChatSession[] = defaultSessions

const mockMutateSessions = mock(() => Promise.resolve(sessions))
const mockSetMessages = mock(() => {})
const mockSendMessage = mock(() => {})
const mockRegenerate = mock(() => {})

let chatMessages: UIMessage[] = []
let chatError: Error | undefined = undefined
let messageContextResponses: Record<
    string,
    {
        status?: number
        body?: unknown
    }
> = {}

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
    useChat: () => {
        const [messagesState, setMessagesState] = useState(chatMessages)
        useEffect(() => {
            setMessagesState(chatMessages)
        }, [])

        return {
            messages: messagesState,
            status: chatError ? 'error' : 'ready',
            error: chatError,
            setMessages: (next: UIMessage[]) => {
                chatMessages = next
                mockSetMessages(next)
                setMessagesState(next)
            },
            sendMessage: mockSendMessage,
            regenerate: mockRegenerate,
        }
    },
}))

mock.module('@/components/chat/ChatSessionSidebar', () => ({
    ChatSessionSidebar: ({
        sessions,
        currentSessionId,
        onNewSession,
        onSwitchSession,
        onDeleteSession,
    }: {
        sessions: readonly ChatSession[]
        currentSessionId: string | null
        onNewSession: () => void
        onSwitchSession: (id: string) => void
        onDeleteSession: (id: string) => void
    }) => (
        <div>
            <div data-testid='current-session'>{currentSessionId ?? 'none'}</div>
            <button type='button' onClick={onNewSession}>
                new-session
            </button>
            {sessions.map((session) => (
                <div key={session.id}>
                    <button
                        type='button'
                        onClick={() => onSwitchSession(session.id)}
                    >
                        switch-{session.id}
                    </button>
                    <button
                        type='button'
                        onClick={() => onDeleteSession(session.id)}
                    >
                        delete-{session.id}
                    </button>
                </div>
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

    const contextResponse = messageContextResponses[url]
    if (contextResponse) {
        const status = contextResponse.status ?? 200
        return Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(contextResponse.body),
        })
    }

    throw new Error(`Unexpected fetch: ${url}`)
})

const { ChatPage } = await import('@/components/chat/ChatPage')

function buildMessageContextResponse(runId: string) {
    return {
        success: true,
        data: {
            version: 1,
            runId,
            manifest: {
                input: {
                    channel: 'web',
                    mode: 'chat',
                    agentType: 'assistant',
                    rawMessages: [],
                    resolvedSessionId: 'session-1',
                    defaults: {},
                },
                pluginOutputs: [],
                assembledContext: {
                    segments: [],
                    systemSegments: [],
                    tools: [],
                    params: {
                        candidates: [],
                        resolved: {},
                    },
                    totalEstimatedInputTokens: 0,
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
}

function createDeferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })

    return { promise, resolve, reject }
}

describe('ChatPage', () => {
    beforeEach(() => {
        cleanup()
        sessions = defaultSessions
        chatMessages = []
        chatError = undefined
        messageContextResponses = {}
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

    it('ignores a late manual switch response after switching again', async () => {
        const session2Deferred = createDeferred<{
            json: () => Promise<unknown>
        }>()

        fetchMock.mockImplementation(((input: string | URL, init?: RequestInit) => {
            const url = String(input)

            if (url === '/api/sessions/session-1/messages') {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            success: true,
                            data: {
                                messages: [],
                                error: null,
                            },
                        }),
                })
            }

            if (url === '/api/sessions/session-2/messages') {
                return session2Deferred.promise
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
                                        parts: [
                                            {
                                                type: 'text',
                                                text: 'hello from session 3',
                                            },
                                        ],
                                    },
                                ],
                                error: null,
                            },
                        }),
                })
            }

            if (url === '/api/sessions/session-1' && init?.method === 'DELETE') {
                return Promise.resolve({ ok: true })
            }

            const contextResponse = messageContextResponses[url]
            if (contextResponse) {
                const status = contextResponse.status ?? 200
                return Promise.resolve({
                    ok: status >= 200 && status < 300,
                    status,
                    json: () => Promise.resolve(contextResponse.body),
                })
            }

            throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetchMock)

        render(<ChatPage />)

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-1',
            ),
        )

        fireEvent.click(screen.getByText('switch-session-2'))
        fireEvent.click(screen.getByText('switch-session-3'))

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-3',
            ),
        )
        await screen.findByText('hello from session 3')

        session2Deferred.resolve({
            json: () =>
                Promise.resolve({
                    success: true,
                    data: {
                        messages: [
                            {
                                id: 'message-2',
                                role: 'user',
                                parts: [
                                    {
                                        type: 'text',
                                        text: 'stale session 2 payload',
                                    },
                                ],
                            },
                        ],
                        error: {
                            message: 'late stale error',
                            name: 'StaleError',
                        },
                    },
                }),
        })

        await waitFor(() =>
            expect(screen.getByText('hello from session 3')).toBeDefined(),
        )
        expect(screen.queryByText('stale session 2 payload')).toBeNull()
        expect(screen.queryByTestId('error-banner')).toBeNull()
    })

    it('ignores a late switch response after starting a new session', async () => {
        const session2Deferred = createDeferred<{
            json: () => Promise<unknown>
        }>()

        fetchMock.mockImplementation(((input: string | URL, init?: RequestInit) => {
            const url = String(input)

            if (url === '/api/sessions/session-1/messages') {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            success: true,
                            data: {
                                messages: [],
                                error: null,
                            },
                        }),
                })
            }

            if (url === '/api/sessions/session-2/messages') {
                return session2Deferred.promise
            }

            if (url === '/api/sessions/session-1' && init?.method === 'DELETE') {
                return Promise.resolve({ ok: true })
            }

            const contextResponse = messageContextResponses[url]
            if (contextResponse) {
                const status = contextResponse.status ?? 200
                return Promise.resolve({
                    ok: status >= 200 && status < 300,
                    status,
                    json: () => Promise.resolve(contextResponse.body),
                })
            }

            throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetchMock)

        render(<ChatPage />)

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-1',
            ),
        )

        fireEvent.click(screen.getByText('switch-session-2'))
        fireEvent.click(screen.getByText('new-session'))

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'none',
            ),
        )

        session2Deferred.resolve({
            json: () =>
                Promise.resolve({
                    success: true,
                    data: {
                        messages: [
                            {
                                id: 'message-2',
                                role: 'user',
                                parts: [
                                    {
                                        type: 'text',
                                        text: 'stale session 2 payload',
                                    },
                                ],
                            },
                        ],
                        error: null,
                    },
                }),
        })

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'none',
            ),
        )
        expect(screen.queryByText('stale session 2 payload')).toBeNull()
        expect(screen.queryByTestId('error-banner')).toBeNull()
    })

    it('retry forwards sessionId in regenerate body (Fix 1 regression guard)', async () => {
        chatError = new Error('stream failed')
        chatMessages = [
            {
                id: 'msg-u1',
                role: 'user',
                parts: [{ type: 'text', text: 'hi' }],
            } as UIMessage,
        ]

        fetchMock.mockImplementationOnce(((input: string | URL) => {
            const url = String(input)
            if (url === '/api/sessions/session-1/messages') {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            success: true,
                            data: {
                                messages: chatMessages,
                                error: null,
                            },
                        }),
                })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetchMock)

        render(<ChatPage />)

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
        chatMessages = [
            {
                id: 'message-1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            } as UIMessage,
        ]

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

        const banner = await screen.findByTestId('error-banner')
        expect(banner).toBeDefined()
        expect(screen.getByTestId('error-message').textContent).toBe(
            'rate limited',
        )
    })

    it('fetches message context once across collapse and re-expand', async () => {
        chatMessages = [
            {
                id: 'message-user-1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            } as UIMessage,
            {
                id: 'message-assistant-1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'hi there' }],
            } as UIMessage,
        ]

        messageContextResponses[
            '/api/sessions/session-1/messages/message-assistant-1/context'
        ] = {
            body: buildMessageContextResponse('run-1'),
        }

        fetchMock.mockImplementationOnce(((input: string | URL) => {
            const url = String(input)
            if (url === '/api/sessions/session-1/messages') {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            success: true,
                            data: {
                                messages: chatMessages,
                                error: null,
                            },
                        }),
                })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetchMock)

        render(<ChatPage />)

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-1',
            ),
        )

        fireEvent.click(
            screen.getByRole('button', { name: /open context/i }),
        )

        await waitFor(() =>
            expect(
                fetchMock.mock.calls.some(
                    ([input]) =>
                        String(input) ===
                        '/api/sessions/session-1/messages/message-assistant-1/context',
                ),
            ).toBe(true),
        )

        const readyButton = screen.getByRole('button', {
            name: /context ready/i,
        })
        expect(readyButton.getAttribute('aria-expanded')).toBe('true')
        expect(
            fetchMock.mock.calls.filter(
                ([input]) =>
                    String(input) ===
                    '/api/sessions/session-1/messages/message-assistant-1/context',
            ),
        ).toHaveLength(1)

        fireEvent.click(readyButton)
        expect(
            screen.getByRole('button', { name: /context ready/i }).getAttribute(
                'aria-expanded',
            ),
        ).toBe('false')

        fireEvent.click(screen.getByRole('button', { name: /context ready/i }))
        expect(
            screen.getByRole('button', { name: /context ready/i }).getAttribute(
                'aria-expanded',
            ),
        ).toBe('true')
        expect(
            fetchMock.mock.calls.filter(
                ([input]) =>
                    String(input) ===
                    '/api/sessions/session-1/messages/message-assistant-1/context',
            ),
        ).toHaveLength(1)
    })

    it('keeps multiple assistant context panels open at the same time', async () => {
        chatMessages = [
            {
                id: 'message-user-1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            } as UIMessage,
            {
                id: 'message-assistant-1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'first reply' }],
            } as UIMessage,
            {
                id: 'message-assistant-2',
                role: 'assistant',
                parts: [{ type: 'text', text: 'second reply' }],
            } as UIMessage,
        ]

        messageContextResponses[
            '/api/sessions/session-1/messages/message-assistant-1/context'
        ] = {
            body: buildMessageContextResponse('run-1'),
        }
        messageContextResponses[
            '/api/sessions/session-1/messages/message-assistant-2/context'
        ] = {
            body: buildMessageContextResponse('run-2'),
        }

        fetchMock.mockImplementationOnce(((input: string | URL) => {
            const url = String(input)
            if (url === '/api/sessions/session-1/messages') {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            success: true,
                            data: {
                                messages: chatMessages,
                                error: null,
                            },
                        }),
                })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetchMock)

        render(<ChatPage />)

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-1',
            ),
        )

        const openButtons = screen.getAllByRole('button', {
            name: /open context/i,
        })
        fireEvent.click(openButtons[0]!)
        fireEvent.click(openButtons[1]!)

        await waitFor(() =>
            expect(
                fetchMock.mock.calls.filter(([input]) =>
                    String(input).includes('/context'),
                ),
            ).toHaveLength(2),
        )

        const readyButtons = screen.getAllByRole('button', {
            name: /context ready/i,
        })
        expect(readyButtons).toHaveLength(2)
        expect(
            readyButtons.every(
                (button) => button.getAttribute('aria-expanded') === 'true',
            ),
        ).toBe(true)
        expect(
            fetchMock.mock.calls.some(
                ([input]) =>
                    String(input) ===
                    '/api/sessions/session-1/messages/message-assistant-1/context',
            ),
        ).toBe(true)
        expect(
            fetchMock.mock.calls.some(
                ([input]) =>
                    String(input) ===
                    '/api/sessions/session-1/messages/message-assistant-2/context',
            ),
        ).toBe(true)
    })

    it('clears old assistant rows immediately when switching sessions', async () => {
        chatMessages = [
            {
                id: 'message-user-1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            } as UIMessage,
            {
                id: 'message-assistant-1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'stale answer' }],
            } as UIMessage,
        ]

        const sessionSwitchDeferred = createDeferred<{
            json: () => Promise<unknown>
        }>()
        fetchMock.mockImplementation(((input: string | URL, init?: RequestInit) => {
            const url = String(input)

            if (url === '/api/sessions/session-1/messages') {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            success: true,
                            data: {
                                messages: chatMessages,
                                error: null,
                            },
                        }),
                })
            }

            if (url === '/api/sessions/session-2/messages') {
                return sessionSwitchDeferred.promise
            }

            if (url === '/api/sessions/session-1' && init?.method === 'DELETE') {
                return Promise.resolve({ ok: true })
            }

            const contextResponse = messageContextResponses[url]
            if (contextResponse) {
                const status = contextResponse.status ?? 200
                return Promise.resolve({
                    ok: status >= 200 && status < 300,
                    status,
                    json: () => Promise.resolve(contextResponse.body),
                })
            }

            throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetchMock)

        render(<ChatPage />)

        const initialButton = await screen.findByRole('button', {
            name: /open context/i,
        })
        expect(initialButton).toBeDefined()

        fireEvent.click(screen.getByText('switch-session-2'))

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-2',
            ),
        )

        expect(
            screen.queryByRole('button', { name: /open context/i }),
        ).toBeNull()
        expect(
            screen.queryByRole('button', { name: /context ready/i }),
        ).toBeNull()

        sessionSwitchDeferred.resolve({
            json: () =>
                Promise.resolve({
                    success: true,
                    data: {
                        messages: [
                            {
                                id: 'message-user-2',
                                role: 'user',
                                parts: [
                                    {
                                        type: 'text',
                                        text: 'hello from session 2',
                                    },
                                ],
                            },
                        ],
                        error: null,
                    },
                }),
        })

        await screen.findByText('hello from session 2')
    })

    it('dedupes in-flight context loads for the same message', async () => {
        chatMessages = [
            {
                id: 'message-user-1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            } as UIMessage,
            {
                id: 'message-assistant-1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'hi there' }],
            } as UIMessage,
        ]

        const contextDeferred = createDeferred<{
            ok: boolean
            status: number
            json: () => Promise<unknown>
        }>()

        fetchMock.mockImplementation(((input: string | URL, init?: RequestInit) => {
            const url = String(input)

            if (url === '/api/sessions/session-1/messages') {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            success: true,
                            data: {
                                messages: chatMessages,
                                error: null,
                            },
                        }),
                })
            }

            if (
                url ===
                '/api/sessions/session-1/messages/message-assistant-1/context'
            ) {
                return contextDeferred.promise
            }

            if (url === '/api/sessions/session-1' && init?.method === 'DELETE') {
                return Promise.resolve({ ok: true })
            }

            const contextResponse = messageContextResponses[url]
            if (contextResponse) {
                const status = contextResponse.status ?? 200
                return Promise.resolve({
                    ok: status >= 200 && status < 300,
                    status,
                    json: () => Promise.resolve(contextResponse.body),
                })
            }

            throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetchMock)

        render(<ChatPage />)

        const openButton = await screen.findByRole('button', {
            name: /open context/i,
        })

        fireEvent.click(openButton)
        fireEvent.click(openButton)

        await waitFor(() =>
            expect(
                fetchMock.mock.calls.filter(
                    ([input]) =>
                        String(input) ===
                        '/api/sessions/session-1/messages/message-assistant-1/context',
                ),
            ).toHaveLength(1),
        )

        contextDeferred.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(buildMessageContextResponse('run-1')),
        })

        await screen.findByRole('button', { name: /context ready/i })
    })

    it('ignores a late auto-restore response after switching sessions', async () => {
        const initialRestoreDeferred = createDeferred<{
            json: () => Promise<unknown>
        }>()

        fetchMock.mockImplementation(((input: string | URL, init?: RequestInit) => {
            const url = String(input)

            if (url === '/api/sessions/session-1/messages') {
                return initialRestoreDeferred.promise
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
                                            {
                                                type: 'text',
                                                text: 'hello from session 2',
                                            },
                                        ],
                                    },
                                ],
                                error: null,
                            },
                        }),
                })
            }

            if (url === '/api/sessions/session-1' && init?.method === 'DELETE') {
                return Promise.resolve({ ok: true })
            }

            const contextResponse = messageContextResponses[url]
            if (contextResponse) {
                const status = contextResponse.status ?? 200
                return Promise.resolve({
                    ok: status >= 200 && status < 300,
                    status,
                    json: () => Promise.resolve(contextResponse.body),
                })
            }

            throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetchMock)

        render(<ChatPage />)

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-1',
            ),
        )

        fireEvent.click(screen.getByText('switch-session-2'))

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-2',
            ),
        )
        await screen.findByText('hello from session 2')

        initialRestoreDeferred.resolve({
            json: () =>
                Promise.resolve({
                    success: true,
                    data: {
                        messages: [
                            {
                                id: 'message-stale-1',
                                role: 'user',
                                parts: [
                                    {
                                        type: 'text',
                                        text: 'stale session 1 payload',
                                    },
                                ],
                            },
                        ],
                        error: {
                            message: 'stale error',
                            name: 'StaleError',
                        },
                    },
                }),
        })

        await waitFor(() =>
            expect(screen.getByText('hello from session 2')).toBeDefined(),
        )
        expect(screen.queryByText('stale session 1 payload')).toBeNull()
        expect(screen.queryByTestId('error-banner')).toBeNull()
    })

    it('ignores a late auto-restore response after deleting the only active session', async () => {
        sessions = [defaultSessions[0]!]

        const initialRestoreDeferred = createDeferred<{
            json: () => Promise<unknown>
        }>()

        fetchMock.mockImplementation(((input: string | URL, init?: RequestInit) => {
            const url = String(input)

            if (url === '/api/sessions/session-1/messages') {
                return initialRestoreDeferred.promise
            }

            if (url === '/api/sessions/session-1' && init?.method === 'DELETE') {
                return Promise.resolve({ ok: true })
            }

            const contextResponse = messageContextResponses[url]
            if (contextResponse) {
                const status = contextResponse.status ?? 200
                return Promise.resolve({
                    ok: status >= 200 && status < 300,
                    status,
                    json: () => Promise.resolve(contextResponse.body),
                })
            }

            throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetchMock)

        render(<ChatPage />)

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'session-1',
            ),
        )

        fireEvent.click(screen.getByText('delete-session-1'))

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'none',
            ),
        )
        expect(screen.getByText('welcome')).toBeDefined()

        initialRestoreDeferred.resolve({
            json: () =>
                Promise.resolve({
                    success: true,
                    data: {
                        messages: [
                            {
                                id: 'message-stale-1',
                                role: 'user',
                                parts: [
                                    {
                                        type: 'text',
                                        text: 'deleted session payload',
                                    },
                                ],
                            },
                        ],
                        error: null,
                    },
                }),
        })

        await waitFor(() =>
            expect(screen.getByTestId('current-session').textContent).toBe(
                'none',
            ),
        )
        expect(screen.queryByText('deleted session payload')).toBeNull()
        expect(screen.queryByTestId('error-banner')).toBeNull()
    })
})
