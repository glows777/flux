import type { UIMessage } from 'ai'
import { prisma as defaultPrisma } from '@/core/db'
import type {
    AfterChatContext,
    AIPlugin,
    HookContext,
} from '../../runtime/types'
import {
    appendMessage as defaultAppendMessage,
    clearSessionError as defaultClearSessionError,
    createSession as defaultCreateSession,
    loadMessages as defaultLoadMessages,
    saveSessionError as defaultSaveSessionError,
    type SessionErrorRecord,
    touchSession as defaultTouchSession,
} from '../../session'

const DEFAULT_TRUNCATE_LIMIT = 20

interface SessionPluginDeps {
    createSession: (
        symbol: string | undefined,
        firstMessage: string,
    ) => Promise<string>
    loadMessages: (sessionId: string) => Promise<UIMessage[]>
    appendMessage: (sessionId: string, message: UIMessage) => Promise<void>
    touchSession: (sessionId: string) => Promise<void>
    resolveSession: (params: {
        channel: string
        sourceId: string
        createdBy: string
        symbol?: string
        title?: string
    }) => Promise<string>
    saveSessionError: (
        sessionId: string,
        error: SessionErrorRecord,
    ) => Promise<void>
    clearSessionError: (sessionId: string) => Promise<void>
}

interface SessionPluginOptions {
    truncateLimit?: number
    deps?: Partial<SessionPluginDeps>
}

function getLastUserMessage(messages: UIMessage[]): UIMessage | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') return messages[i]
    }
    return undefined
}

function extractFirstMessageText(messages: UIMessage[]): string {
    const first = messages.find((m) => m.role === 'user')
    if (!first) return 'New chat'
    const textPart = first.parts?.find(
        (part): part is Extract<UIMessage['parts'][number], { type: 'text' }> =>
            part.type === 'text',
    )
    return textPart?.text?.slice(0, 100) ?? 'New chat'
}

async function defaultResolveSession(params: {
    channel: string
    sourceId: string
    createdBy: string
    symbol?: string
    title?: string
}): Promise<string> {
    const db = defaultPrisma

    const existing = await db.chatSession.findFirst({
        where: {
            channel: params.channel,
            sourceId: params.sourceId,
        },
        orderBy: { createdAt: 'desc' },
    })

    if (existing) return existing.id

    const session = await db.chatSession.create({
        data: {
            channel: params.channel,
            sourceId: params.sourceId,
            createdBy: params.createdBy,
            symbol: params.symbol ?? null,
            title: params.title ?? 'New session',
        },
    })
    return session.id
}

export function sessionPlugin(options?: SessionPluginOptions): AIPlugin {
    const limit = options?.truncateLimit ?? DEFAULT_TRUNCATE_LIMIT
    const deps: SessionPluginDeps = {
        createSession: async (symbol, firstMessage) => {
            const session = await defaultCreateSession(
                symbol ?? null,
                firstMessage,
            )
            return session.id
        },
        loadMessages: defaultLoadMessages,
        appendMessage: defaultAppendMessage,
        touchSession: defaultTouchSession,
        resolveSession: defaultResolveSession,
        saveSessionError: defaultSaveSessionError,
        clearSessionError: defaultClearSessionError,
        ...options?.deps,
    }

    return {
        name: 'session',

        async beforeChat(ctx: HookContext): Promise<void> {
            let sessionId = ctx.sessionId

            if (ctx.mode === 'trigger') {
                // Trigger mode: always create a fresh session — no resolution
                sessionId = await deps.createSession(
                    ctx.symbol,
                    extractFirstMessageText(ctx.rawMessages),
                )
            } else if (!sessionId && ctx.meta.has('sourceId')) {
                // Conversation mode — Discord/Cron path: resolve by sourceId
                sessionId = await deps.resolveSession({
                    channel: ctx.channel,
                    sourceId: ctx.meta.get('sourceId') as string,
                    createdBy: (ctx.meta.get('userId') as string) ?? 'system',
                    symbol: ctx.symbol,
                    title: extractFirstMessageText(ctx.rawMessages),
                })
            } else if (!sessionId) {
                // Conversation mode — Web path: create new session
                sessionId = await deps.createSession(
                    ctx.symbol,
                    extractFirstMessageText(ctx.rawMessages),
                )
            }

            ctx.meta.set('sessionId', sessionId)

            // Persist last user message
            const lastUserMsg = getLastUserMessage(ctx.rawMessages)
            if (lastUserMsg) {
                await deps.appendMessage(sessionId, lastUserMsg)
            }

            // Clear any prior error — a new attempt is starting.
            // If this attempt also fails, onError will write a fresh record.
            await deps.clearSessionError(sessionId)
        },

        async transformMessages(
            ctx: HookContext,
            messages: UIMessage[],
        ): Promise<UIMessage[]> {
            // For discord/cron: load history from DB (already includes the just-appended user message)
            const sourceId = ctx.meta.get('sourceId') as string | undefined
            if (sourceId) {
                const sessionId = ctx.meta.get('sessionId') as string
                if (sessionId) {
                    const history = await deps.loadMessages(sessionId)
                    if (history.length > limit) return history.slice(-limit)
                    return history
                }
            }

            // Web path: messages come from frontend (already include history)
            if (messages.length <= limit) return messages
            return messages.slice(-limit)
        },

        async afterChat(ctx: AfterChatContext): Promise<void> {
            await deps.appendMessage(ctx.sessionId, ctx.responseMessage)
            await deps.touchSession(ctx.sessionId)
            // Idempotent safety net — beforeChat already cleared, but double-clear
            // guarantees no stale error if beforeChat's clear somehow failed silently.
            await deps.clearSessionError(ctx.sessionId)
        },

        async onError(ctx: HookContext, error: Error): Promise<void> {
            const sessionId = ctx.meta.get('sessionId') as string | undefined
            if (!sessionId) {
                // Session wasn't resolved (e.g., createSession itself threw).
                // No session to attach the error to — frontend's useChat.error
                // is the only surface until/unless a session exists.
                return
            }

            const code = (error as { code?: unknown }).code
            await deps.saveSessionError(sessionId, {
                message: error.message,
                name: error.name,
                code: typeof code === 'string' ? code : undefined,
            })
        },
    }
}
