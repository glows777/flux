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
import { fetcher } from '@/lib/fetcher'
import type { ChatSession } from './ChatSessionItem'
import { ChatSessionSidebar } from './ChatSessionSidebar'
import { ChatWelcome } from './ChatWelcome'
import { AssistantMessage } from './messages/AssistantMessage'
import { ErrorBanner } from './messages/ErrorBanner'
import { TruncationNotice } from './messages/TruncationNotice'
import { UserMessage } from './messages/UserMessage'

type ChatMetadata = { sessionId?: string }

const MAX_Q_LENGTH = 500
const SIDEBAR_STORAGE_KEY = 'flux-chat-sidebar'

function loadSessionMessages(
    sessionId: string,
    signal: AbortSignal,
): Promise<UIMessage<ChatMetadata>[] | null> {
    return fetch(`/api/sessions/${sessionId}/messages`, { signal })
        .then((r) => r.json())
        .then((json) => (json.success && json.data ? json.data : null))
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
                    setSessionId(message.metadata.sessionId)
                    // Don't setChatId here — changing useChat's `id` mid-conversation
                    // causes it to switch to an empty internal store, losing all messages.
                    // sessionIdRef handles server communication; chatId only changes on session switch.
                    initializedRef.current = true
                }
                mutateSessions()
            },
        })

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

        setSessionId(mostRecent.id)
        setChatId(mostRecent.id)

        loadSessionMessages(mostRecent.id, controller.signal).then((data) => {
            if (data) setMessages(data)
        })

        return () => controller.abort()
    }, [sessions, q, setMessages])

    // ─── ?q= auto-send with ref guard ───
    const hasSentQRef = useRef(false)

    useEffect(() => {
        if (!q || hasSentQRef.current) return
        hasSentQRef.current = true
        initializedRef.current = true // Prevent auto-restore from overwriting this new chat

        const truncatedQ = q.slice(0, MAX_Q_LENGTH)

        // Create new session + send
        setSessionId(null)
        setChatId(undefined)
        setMessages([])

        sendMessage({ text: truncatedQ }, { body: { sessionId: null, symbol } })

        // Clear q from URL
        const params = new URLSearchParams(searchParams.toString())
        params.delete('q')
        const newUrl = params.toString()
            ? `/chat?${params.toString()}`
            : '/chat'
        router.replace(newUrl)
    }, [q, symbol, searchParams, router, sendMessage, setMessages])

    // ─── Chat actions ───

    const handleSend = useCallback(() => {
        const text = inputValue.trim()
        if (!text || isLoading) return

        sendMessage(
            { text },
            { body: { sessionId: sessionIdRef.current, symbol } },
        )
        setInputValue('')
    }, [inputValue, isLoading, sendMessage, symbol])

    const handleSuggestionClick = useCallback(
        (text: string) => {
            if (isLoading) return
            sendMessage(
                { text },
                { body: { sessionId: sessionIdRef.current, symbol } },
            )
        },
        [isLoading, sendMessage, symbol],
    )

    const handleNewSession = useCallback(() => {
        setSessionId(null)
        setChatId(undefined)
        setMessages([])
    }, [setMessages])

    const switchAbortRef = useRef<AbortController | null>(null)

    const handleSwitchSession = useCallback(
        (id: string) => {
            switchAbortRef.current?.abort()
            const controller = new AbortController()
            switchAbortRef.current = controller

            setSessionId(id)
            setChatId(id)
            loadSessionMessages(id, controller.signal).then((data) => {
                if (data) setMessages(data)
            })
        },
        [setMessages],
    )

    const handleDeleteSession = useCallback(
        async (id: string) => {
            try {
                const res = await fetch(`/api/sessions/${id}`, {
                    method: 'DELETE',
                })
                if (res.ok) {
                    mutateSessions()
                    setSessionId((prev) => {
                        if (prev === id) {
                            setChatId(undefined)
                            setMessages([])
                            return null
                        }
                        return prev
                    })
                }
            } catch {
                // Deletion failure is non-fatal
            }
        },
        [mutateSessions, setMessages],
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
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    })

    const placeholder = symbol ? `询问关于 ${symbol} 的问题...` : '发送消息...'

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

            <div className='flex-1 flex flex-col min-w-0'>
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
                            {messages.map((msg, index) => {
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
                                    const isLast = index === messages.length - 1
                                    messageNode = (
                                        <AssistantMessage
                                            key={msg.id}
                                            message={msg}
                                            isLast={isLast}
                                            isLoading={isLoading}
                                        />
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
                            })}

                            {error && (
                                <ErrorBanner
                                    error={error}
                                    onReload={regenerate}
                                />
                            )}
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
        </div>
    )
}
