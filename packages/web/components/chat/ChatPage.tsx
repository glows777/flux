'use client'

import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { DefaultChatTransport } from 'ai'
import { PanelLeft } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { ContextInput } from '@/components/detail/ContextInput'
import { TRUNCATE_LIMIT } from '@/lib/ai/constants'
import {
    fetchRunTrace,
    getRunIdFromMessage,
    type RunTraceState,
} from '@/lib/ai/run-trace-visibility'
import { fetcher } from '@/lib/fetcher'
import type { ChatSession } from './ChatSessionItem'
import { ChatSessionSidebar } from './ChatSessionSidebar'
import { ChatWelcome } from './ChatWelcome'
import { AssistantMessage } from './messages/AssistantMessage'
import { ErrorBanner } from './messages/ErrorBanner'
import { RunTraceDetailSheet } from './messages/RunTraceDetailSheet'
import { RunTraceSummaryStrip } from './messages/RunTraceSummaryStrip'
import { TruncationNotice } from './messages/TruncationNotice'
import { UserMessage } from './messages/UserMessage'

type ChatMetadata = { sessionId?: string; runId?: string }

type PersistedSessionError = {
    readonly message: string
    readonly name: string
    readonly code?: string
}

type SessionLoadResult = {
    readonly messages: UIMessage<ChatMetadata>[]
    readonly error: PersistedSessionError | null
}

const MAX_Q_LENGTH = 500
const SIDEBAR_STORAGE_KEY = 'flux-chat-sidebar'

function getAdjacentSessionId(
    sessions: readonly ChatSession[],
    deletedSessionId: string,
): string | null {
    const deletedIndex = sessions.findIndex(
        (session) => session.id === deletedSessionId,
    )

    if (deletedIndex === -1) return null

    return (
        sessions[deletedIndex + 1]?.id ?? sessions[deletedIndex - 1]?.id ?? null
    )
}

function loadSessionMessages(
    sessionId: string,
    signal: AbortSignal,
): Promise<SessionLoadResult | null> {
    return fetch(`/api/sessions/${sessionId}/messages`, { signal })
        .then((r) => r.json())
        .then((json) => {
            if (!json.success || !json.data) return null
            // Backend returns { messages, error }. Guard against older shape
            // (plain array) in case of deploy-order skew.
            if (Array.isArray(json.data)) {
                return { messages: json.data, error: null }
            }
            return {
                messages: json.data.messages ?? [],
                error: json.data.error ?? null,
            }
        })
        .catch(() => null)
}

export function ChatPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const symbol = searchParams.get('symbol')?.toUpperCase() ?? null
    const q = searchParams.get('q')

    const [sessionId, setSessionId] = useState<string | null>(null)
    const [inputValue, setInputValue] = useState('')
    const [chatId, setChatId] = useState<string | undefined>(undefined)
    const [persistedError, setPersistedError] =
        useState<PersistedSessionError | null>(null)
    const [runTraceStates, setRunTraceStates] = useState<
        Record<string, RunTraceState>
    >({})
    const [activeTraceMessageId, setActiveTraceMessageId] = useState<
        string | null
    >(null)

    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [sidebarMounted, setSidebarMounted] = useState(false)

    useEffect(() => {
        const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
        if (stored === 'collapsed') setSidebarCollapsed(true)
        if (window.innerWidth < 768) setSidebarCollapsed(true)
        setSidebarMounted(true)
    }, [])

    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed((prev) => {
            const next = !prev
            localStorage.setItem(
                SIDEBAR_STORAGE_KEY,
                next ? 'collapsed' : 'expanded',
            )
            return next
        })
    }, [])

    // [C2 fix] Ref to avoid stale closure in onFinish
    const sessionIdRef = useRef(sessionId)
    sessionIdRef.current = sessionId
    const runTraceStatesRef = useRef(runTraceStates)
    const activeTraceMessageIdRef = useRef(activeTraceMessageId)
    const inFlightRunTraceLoadsRef = useRef<Set<string>>(new Set())
    const runTraceGenerationRef = useRef(0)
    const initialRestoreAbortRef = useRef<AbortController | null>(null)
    const initialRestoreRequestIdRef = useRef(0)

    useEffect(() => {
        runTraceStatesRef.current = runTraceStates
    }, [runTraceStates])

    useEffect(() => {
        activeTraceMessageIdRef.current = activeTraceMessageId
    }, [activeTraceMessageId])

    const resetRunTraceState = useCallback(() => {
        runTraceGenerationRef.current += 1
        inFlightRunTraceLoadsRef.current.clear()
        runTraceStatesRef.current = {}
        activeTraceMessageIdRef.current = null
        setRunTraceStates({})
        setActiveTraceMessageId(null)
    }, [])

    const loadRunTrace = useCallback(
        async (
            messageId: string,
            runId: string | null,
            options?: { force?: boolean },
        ) => {
            if (!runId) {
                setRunTraceStates((prev) => ({
                    ...prev,
                    [messageId]: { status: 'unavailable' },
                }))
                return
            }

            const cachedState = runTraceStatesRef.current[messageId]
            if (
                !options?.force &&
                cachedState != null &&
                cachedState.status !== 'idle'
            ) {
                return
            }
            if (inFlightRunTraceLoadsRef.current.has(messageId)) {
                return
            }

            const generation = runTraceGenerationRef.current
            inFlightRunTraceLoadsRef.current.add(messageId)

            setRunTraceStates((prev) => ({
                ...prev,
                [messageId]: { status: 'loading' },
            }))

            try {
                const record = await fetchRunTrace(runId)

                if (runTraceGenerationRef.current !== generation) return

                setRunTraceStates((prev) => ({
                    ...prev,
                    [messageId]: { status: 'ready', record },
                }))
            } catch (error) {
                if (runTraceGenerationRef.current !== generation) return

                setRunTraceStates((prev) => ({
                    ...prev,
                    [messageId]: {
                        status: 'error',
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Failed to load run trace',
                    },
                }))
            } finally {
                inFlightRunTraceLoadsRef.current.delete(messageId)
            }
        },
        [],
    )

    const prefetchLatestAssistantTrace = useCallback(
        (nextMessages: readonly UIMessage<ChatMetadata>[]) => {
            const latestAssistant = [...nextMessages]
                .reverse()
                .find((message) => message.role === 'assistant')

            if (!latestAssistant) return

            const runId = getRunIdFromMessage(latestAssistant)
            if (!runId) return

            void loadRunTrace(latestAssistant.id, runId)
        },
        [loadRunTrace],
    )

    // Session list (global)
    const {
        data: sessions,
        error: sessionsError,
        isLoading: sessionsLoading,
        mutate: mutateSessions,
    } = useSWR<ChatSession[]>('/api/sessions', fetcher)

    // [M1 fix] Memoize transport
    // Chat uses SSE streaming — must call server directly to avoid
    // Next.js rewrite buffering. Other endpoints go through the proxy.
    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat`,
            }),
        [],
    )

    const { messages, status, error, setMessages, sendMessage, regenerate } =
        useChat<UIMessage<ChatMetadata>>({
            ...(chatId != null ? { id: chatId } : {}),
            messages: [],
            transport,
            onFinish: ({ message }) => {
                if (!sessionIdRef.current && message.metadata?.sessionId) {
                    sessionIdRef.current = message.metadata.sessionId
                    setSessionId(message.metadata.sessionId)
                    // Don't setChatId here — changing useChat's `id` mid-conversation
                    // causes it to switch to an empty internal store, losing all messages.
                    // sessionIdRef handles server communication; chatId only changes on session switch.
                    initializedRef.current = true
                }

                if (message.role === 'assistant') {
                    const runId = getRunIdFromMessage(message)
                    if (runId) {
                        void loadRunTrace(message.id, runId)
                    }
                }

                mutateSessions()
            },
        })

    useEffect(() => {
        if (activeTraceMessageId == null) return

        const activeAssistantExists = messages.some(
            (message) =>
                message.role === 'assistant' &&
                message.id === activeTraceMessageId,
        )

        if (!activeAssistantExists) {
            setActiveTraceMessageId(null)
        }
    }, [activeTraceMessageId, messages])

    const clearMessageState = useCallback(() => {
        resetRunTraceState()
        setMessages([])
    }, [resetRunTraceState, setMessages])

    const cancelInitialRestore = useCallback(() => {
        initialRestoreRequestIdRef.current += 1
        initialRestoreAbortRef.current?.abort()
        initialRestoreAbortRef.current = null
    }, [])

    const cancelSwitchSessionLoad = useCallback(() => {
        switchSessionRequestIdRef.current += 1
        switchAbortRef.current?.abort()
        switchAbortRef.current = null
    }, [])

    const isLoading = status === 'submitted' || status === 'streaming'

    // ─── Auto-restore most recent session ───
    const initializedRef = useRef(false)

    useEffect(() => {
        if (initializedRef.current) return
        if (q) return // ?q= will create new session, skip restore
        if (!sessions || sessions.length === 0) return

        initializedRef.current = true
        const mostRecent = sessions[0]
        const controller = new AbortController()
        const requestId = initialRestoreRequestIdRef.current + 1
        initialRestoreRequestIdRef.current = requestId
        initialRestoreAbortRef.current = controller

        setSessionId(mostRecent.id)
        setChatId(mostRecent.id)

        loadSessionMessages(mostRecent.id, controller.signal).then((result) => {
            if (initialRestoreRequestIdRef.current !== requestId) return
            if (!result) return
            setMessages(result.messages)
            setPersistedError(result.error)
            prefetchLatestAssistantTrace(result.messages)
        })

        return () => {
            if (initialRestoreAbortRef.current === controller) {
                initialRestoreAbortRef.current = null
            }
            controller.abort()
        }
    }, [prefetchLatestAssistantTrace, sessions, q, setMessages])

    // ─── ?q= auto-send with ref guard ───
    const hasSentQRef = useRef(false)

    useEffect(() => {
        if (!q || hasSentQRef.current) return
        hasSentQRef.current = true
        initializedRef.current = true // Prevent auto-restore from overwriting this new chat

        const truncatedQ = q.slice(0, MAX_Q_LENGTH)

        // Create new session + send
        cancelInitialRestore()
        cancelSwitchSessionLoad()
        setSessionId(null)
        setChatId(undefined)
        clearMessageState()
        setPersistedError(null)

        sendMessage({ text: truncatedQ }, { body: { sessionId: null, symbol } })

        // Clear q from URL
        const params = new URLSearchParams(searchParams.toString())
        params.delete('q')
        const newUrl = params.toString()
            ? `/chat?${params.toString()}`
            : '/chat'
        router.replace(newUrl)
    }, [
        cancelInitialRestore,
        cancelSwitchSessionLoad,
        clearMessageState,
        q,
        symbol,
        searchParams,
        router,
        sendMessage,
    ])

    // ─── Chat actions ───

    const handleSend = useCallback(() => {
        const text = inputValue.trim()
        if (!text || isLoading) return

        setPersistedError(null)
        sendMessage(
            { text },
            { body: { sessionId: sessionIdRef.current, symbol } },
        )
        setInputValue('')
    }, [inputValue, isLoading, sendMessage, symbol])

    const handleSuggestionClick = useCallback(
        (text: string) => {
            if (isLoading) return
            setPersistedError(null)
            sendMessage(
                { text },
                { body: { sessionId: sessionIdRef.current, symbol } },
            )
        },
        [isLoading, sendMessage, symbol],
    )

    const handleNewSession = useCallback(() => {
        cancelInitialRestore()
        cancelSwitchSessionLoad()
        setSessionId(null)
        setChatId(undefined)
        clearMessageState()
        setPersistedError(null)
    }, [cancelInitialRestore, cancelSwitchSessionLoad, clearMessageState])

    const handleRetry = useCallback(() => {
        setPersistedError(null)
        regenerate({
            body: { sessionId: sessionIdRef.current, symbol },
        })
    }, [regenerate, symbol])

    const switchAbortRef = useRef<AbortController | null>(null)
    const switchSessionRequestIdRef = useRef(0)

    const handleSwitchSession = useCallback(
        (id: string) => {
            cancelInitialRestore()
            switchAbortRef.current?.abort()
            const controller = new AbortController()
            const requestId = switchSessionRequestIdRef.current + 1
            switchSessionRequestIdRef.current = requestId
            switchAbortRef.current = controller

            clearMessageState()
            setSessionId(id)
            setChatId(id)
            setPersistedError(null)
            loadSessionMessages(id, controller.signal).then((result) => {
                if (switchSessionRequestIdRef.current !== requestId) return
                if (!result) return
                setMessages(result.messages)
                setPersistedError(result.error)
                prefetchLatestAssistantTrace(result.messages)
            })
        },
        [
            cancelInitialRestore,
            clearMessageState,
            prefetchLatestAssistantTrace,
            setMessages,
        ],
    )

    const handleDeleteSession = useCallback(
        async (id: string) => {
            try {
                const res = await fetch(`/api/sessions/${id}`, {
                    method: 'DELETE',
                })
                if (res.ok) {
                    const adjacentSessionId =
                        sessions != null
                            ? getAdjacentSessionId(sessions, id)
                            : null

                    mutateSessions()

                    if (sessionIdRef.current !== id) return

                    if (adjacentSessionId) {
                        handleSwitchSession(adjacentSessionId)
                        return
                    }

                    cancelInitialRestore()
                    setSessionId(null)
                    setChatId(undefined)
                    clearMessageState()
                    setPersistedError(null)
                }
            } catch {
                // Deletion failure is non-fatal
            }
        },
        [
            cancelInitialRestore,
            clearMessageState,
            handleSwitchSession,
            mutateSessions,
            sessions,
        ],
    )

    const handleRenameSession = useCallback(
        async (id: string, title: string) => {
            try {
                await fetch(`/api/sessions/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title }),
                })
                mutateSessions()
            } catch {
                // Rename failure is non-fatal
            }
        },
        [mutateSessions],
    )

    // ─── Auto-scroll ───
    const bottomRef = useRef<HTMLDivElement>(null)
    const previousScrollSignatureRef = useRef<string | null>(null)
    const messageScrollSignature = useMemo(() => {
        const lastMessage = messages.at(-1)
        if (!lastMessage) return null

        return JSON.stringify({
            count: messages.length,
            id: lastMessage.id,
            role: lastMessage.role,
            parts: lastMessage.parts,
        })
    }, [messages])

    useEffect(() => {
        if (messageScrollSignature == null) {
            previousScrollSignatureRef.current = null
            return
        }

        if (previousScrollSignatureRef.current === messageScrollSignature) {
            return
        }

        previousScrollSignatureRef.current = messageScrollSignature
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messageScrollSignature])

    const placeholder = symbol ? `询问关于 ${symbol} 的问题...` : '发送消息...'
    const activeTraceState =
        activeTraceMessageId == null
            ? { status: 'idle' as const }
            : (runTraceStates[activeTraceMessageId] ?? {
                  status: 'idle' as const,
              })
    const activeTraceRunId =
        activeTraceMessageId == null
            ? null
            : getRunIdFromMessage(
                  messages.find(
                      (message) => message.id === activeTraceMessageId,
                  ) as UIMessage<ChatMetadata> | undefined,
              )
    const handleOpenTraceMessage = useCallback(
        (messageId: string, runId: string | null) => {
            const isSelected = activeTraceMessageIdRef.current === messageId
            if (isSelected) {
                setActiveTraceMessageId(null)
                return
            }

            setActiveTraceMessageId(messageId)

            void loadRunTrace(messageId, runId)
        },
        [loadRunTrace],
    )

    return (
        <div className='flex h-full flex-1 min-w-0'>
            <ChatSessionSidebar
                sessions={sessions ?? []}
                currentSessionId={sessionId}
                isLoadingList={sessionsLoading}
                listError={sessionsError}
                onRetryList={() => mutateSessions()}
                onNewSession={handleNewSession}
                onSwitchSession={handleSwitchSession}
                onDeleteSession={handleDeleteSession}
                onRenameSession={handleRenameSession}
                collapsed={sidebarCollapsed}
                mounted={sidebarMounted}
                onToggleCollapse={toggleSidebar}
            />

            <div className='flex min-w-0 flex-1'>
                <div className='flex min-w-0 flex-1 flex-col'>
                    {sidebarCollapsed && (
                        <div className='p-2'>
                            <button
                                type='button'
                                onClick={toggleSidebar}
                                className='p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors'
                                aria-label='展开侧栏'
                            >
                                <PanelLeft size={16} />
                            </button>
                        </div>
                    )}
                    {/* Message area */}
                    <div className='flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10'>
                        {messages.length === 0 ? (
                            <ChatWelcome
                                symbol={symbol}
                                onSuggestionClick={handleSuggestionClick}
                            />
                        ) : (
                            <div className='max-w-5xl w-[85%] mx-auto px-6 py-6 space-y-4'>
                                {(() => {
                                    let assistantMessageCount = 0

                                    return messages.map((msg, index) => {
                                        const cutoffIndex =
                                            messages.length - TRUNCATE_LIMIT
                                        const showDivider =
                                            messages.length > TRUNCATE_LIMIT &&
                                            index === cutoffIndex

                                        let messageNode: React.ReactNode = null
                                        if (msg.role === 'user') {
                                            const textPart = msg.parts?.find(
                                                (p) => p.type === 'text',
                                            )
                                            const text =
                                                textPart && 'text' in textPart
                                                    ? textPart.text
                                                    : ''
                                            messageNode = (
                                                <UserMessage
                                                    key={msg.id}
                                                    content={text}
                                                />
                                            )
                                        } else if (msg.role === 'assistant') {
                                            assistantMessageCount += 1
                                            const isLast =
                                                index === messages.length - 1
                                            const contextState = runTraceStates[
                                                msg.id
                                            ] ?? {
                                                status: 'idle',
                                            }
                                            const isTraceOpen =
                                                activeTraceMessageId === msg.id
                                            const actionLabel = `assistant message ${assistantMessageCount}`
                                            const runId =
                                                getRunIdFromMessage(msg)
                                            messageNode = (
                                                <div
                                                    key={msg.id}
                                                    className='space-y-3'
                                                >
                                                    <AssistantMessage
                                                        message={msg}
                                                        isLast={isLast}
                                                        isLoading={isLoading}
                                                    />
                                                    <RunTraceSummaryStrip
                                                        state={contextState}
                                                        isSelected={isTraceOpen}
                                                        actionLabel={
                                                            actionLabel
                                                        }
                                                        onOpen={() =>
                                                            handleOpenTraceMessage(
                                                                msg.id,
                                                                runId,
                                                            )
                                                        }
                                                        onRetry={() => {
                                                            setActiveTraceMessageId(
                                                                msg.id,
                                                            )
                                                            void loadRunTrace(
                                                                msg.id,
                                                                runId,
                                                                {
                                                                    force: true,
                                                                },
                                                            )
                                                        }}
                                                    />
                                                </div>
                                            )
                                        }

                                        if (showDivider) {
                                            return (
                                                <div key={msg.id}>
                                                    <TruncationNotice />
                                                    {messageNode}
                                                </div>
                                            )
                                        }
                                        return messageNode
                                    })
                                })()}

                                {error ? (
                                    <ErrorBanner
                                        error={error}
                                        onReload={handleRetry}
                                    />
                                ) : persistedError ? (
                                    <ErrorBanner
                                        error={Object.assign(
                                            new Error(persistedError.message),
                                            { name: persistedError.name },
                                        )}
                                        onReload={handleRetry}
                                    />
                                ) : null}
                                <div ref={bottomRef} />
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className='max-w-5xl w-[85%] mx-auto'>
                        <ContextInput
                            value={inputValue}
                            onChange={setInputValue}
                            onSend={handleSend}
                            isLoading={isLoading}
                            placeholder={placeholder}
                        />
                    </div>
                </div>

                <RunTraceDetailSheet
                    state={activeTraceState}
                    isOpen={activeTraceMessageId != null}
                    messageId={activeTraceMessageId}
                    runId={activeTraceRunId}
                    onClose={() => setActiveTraceMessageId(null)}
                    onRetry={() => {
                        const messageId = activeTraceMessageIdRef.current
                        if (!messageId) return

                        void loadRunTrace(messageId, activeTraceRunId, {
                            force: true,
                        })
                    }}
                />
            </div>
        </div>
    )
}
