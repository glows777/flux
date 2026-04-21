/**
 * Phase 3: Session CRUD + Message Persistence
 *
 * 会话管理业务逻辑 + 消息读写辅助函数。
 * 所有函数通过 deps 参数支持测试替换。
 */

import { Prisma, type PrismaClient } from '@prisma/client'
import type { UIMessage } from 'ai'
import { prisma as defaultPrisma } from '@/core/db'
import { SessionError, type SessionErrorCode } from './session-errors'
import {
    loadMessageManifest as loadMessageManifestRecord,
    type MessageManifestRecord,
    saveMessageManifest as saveMessageManifestRecord,
} from './session-manifest'

// --- Types ---

/** Message with timestamp for transcript loading */
interface TranscriptMessage {
    readonly message: UIMessage
    readonly createdAt: Date
}

// --- Constants ---

import { TRUNCATE_LIMIT } from './constants'

const TITLE_MAX_LENGTH = 20

export { TRUNCATE_LIMIT }
export { SessionError }
export type { MessageManifestRecord, SessionErrorCode }

// --- Deps ---

export interface SessionDeps {
    readonly db: PrismaClient
}

function getDefaultDeps(): SessionDeps {
    return { db: defaultPrisma }
}

// --- Prisma Error Helpers ---

function isPrismaNotFoundError(error: unknown): boolean {
    return (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2025'
    )
}

// --- Session CRUD ---

export async function listAllSessions(deps?: SessionDeps) {
    const { db } = deps ?? getDefaultDeps()
    return db.chatSession.findMany({
        orderBy: { updatedAt: 'desc' },
    })
}

export async function createSession(
    symbol: string | null,
    firstMessage: string,
    deps?: SessionDeps,
) {
    const { db } = deps ?? getDefaultDeps()

    const title = firstMessage.slice(0, TITLE_MAX_LENGTH)

    return db.chatSession.create({
        data: { symbol, title },
    })
}

export async function deleteSession(id: string, deps?: SessionDeps) {
    const { db } = deps ?? getDefaultDeps()

    try {
        await db.chatSession.delete({ where: { id } })
    } catch (error) {
        if (isPrismaNotFoundError(error)) {
            throw new SessionError('Session not found', 'NOT_FOUND')
        }
        throw error
    }
}

export async function renameSession(
    id: string,
    title: string,
    deps?: SessionDeps,
) {
    const { db } = deps ?? getDefaultDeps()

    if (!title || title.length === 0) {
        throw new SessionError('Title must not be empty', 'INVALID_INPUT')
    }
    if (title.length > TITLE_MAX_LENGTH) {
        throw new SessionError(
            `Title must not exceed ${TITLE_MAX_LENGTH} characters`,
            'INVALID_INPUT',
        )
    }

    const existingSession = await db.chatSession.findUnique({
        where: { id },
        select: { updatedAt: true },
    })

    if (!existingSession) {
        throw new SessionError('Session not found', 'NOT_FOUND')
    }

    try {
        return await db.chatSession.update({
            where: { id },
            // Preserve activity ordering: renaming should not bump updatedAt.
            data: { title, updatedAt: existingSession.updatedAt },
        })
    } catch (error) {
        if (isPrismaNotFoundError(error)) {
            throw new SessionError('Session not found', 'NOT_FOUND')
        }
        throw error
    }
}

export async function touchSession(id: string, deps?: SessionDeps) {
    const { db } = deps ?? getDefaultDeps()

    try {
        await db.chatSession.update({
            where: { id },
            data: { updatedAt: new Date() },
        })
    } catch (error) {
        if (isPrismaNotFoundError(error)) {
            throw new SessionError('Session not found', 'NOT_FOUND')
        }
        throw error
    }
}

/**
 * 为指定 channel 创建新 session，使 resolveSession 的
 * findFirst({ orderBy: { createdAt: 'desc' } }) 命中新记录。
 *
 * 旧 session 不删除，保留作历史记录。
 * 这是 /clear 命令的底层实现——在同一个 sourceId 下
 * 创建一条新的 ChatSession，下次 resolveSession 自然取到它。
 */
export async function clearChannelSession(
    params: {
        readonly channel: string
        readonly sourceId: string
        readonly createdBy: string
    },
    deps?: SessionDeps,
): Promise<{ id: string }> {
    const { db } = deps ?? getDefaultDeps()
    const now = new Date()
    const timeStr = now.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
    const title = `${params.channel} - created at ${timeStr}`

    return db.chatSession.create({
        data: {
            channel: params.channel,
            sourceId: params.sourceId,
            createdBy: params.createdBy,
            title,
        },
        select: { id: true },
    })
}

// --- Message Persistence ---

export async function loadMessages(
    sessionId: string,
    deps?: SessionDeps,
): Promise<UIMessage[]> {
    const { db } = deps ?? getDefaultDeps()

    const rows = await db.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
    })

    return rows.map((row) => {
        try {
            return JSON.parse(row.content) as UIMessage
        } catch {
            throw new SessionError(
                `Failed to parse message content for message ${row.id}`,
                'INVALID_INPUT',
            )
        }
    })
}

export async function appendMessage(
    sessionId: string,
    message: UIMessage,
    deps?: SessionDeps,
): Promise<void> {
    const { db } = deps ?? getDefaultDeps()

    await db.chatMessage.upsert({
        where: {
            sessionId_messageId: { sessionId, messageId: message.id },
        },
        create: {
            sessionId,
            messageId: message.id,
            content: JSON.stringify(message),
        },
        update: {
            content: JSON.stringify(message),
        },
    })
}

export async function saveMessageManifest(
    sessionId: string,
    messageId: string,
    manifest: Parameters<typeof saveMessageManifestRecord>[2],
    deps?: SessionDeps,
): Promise<void> {
    const resolvedDeps = deps ?? getDefaultDeps()
    return saveMessageManifestRecord(
        sessionId,
        messageId,
        manifest,
        resolvedDeps,
    )
}

export async function loadMessageManifest(
    sessionId: string,
    messageId: string,
    deps?: SessionDeps,
): Promise<MessageManifestRecord | null> {
    const resolvedDeps = deps ?? getDefaultDeps()
    return loadMessageManifestRecord(sessionId, messageId, resolvedDeps)
}

// --- Session Error Persistence ---

/**
 * 当前 session 最近一次失败的 chat 尝试。
 * beforeChat/afterChat 清空，onError 写入。
 * 前端刷新/切换 session 时读取，用于展示 ErrorBanner + 重试按钮。
 */
export interface SessionErrorRecord {
    readonly message: string
    readonly name: string
    readonly code?: string
}

export async function saveSessionError(
    sessionId: string,
    error: SessionErrorRecord,
    deps?: SessionDeps,
): Promise<void> {
    const { db } = deps ?? getDefaultDeps()

    try {
        await db.chatSession.update({
            where: { id: sessionId },
            data: {
                lastError: { ...error },
                lastErrorAt: new Date(),
                // Don't bump updatedAt — error shouldn't promote session in sidebar.
            },
            select: { id: true },
        })
    } catch (err) {
        if (isPrismaNotFoundError(err)) {
            // Session was deleted mid-error — silently drop.
            return
        }
        throw err
    }
}

export async function clearSessionError(
    sessionId: string,
    deps?: SessionDeps,
): Promise<void> {
    const { db } = deps ?? getDefaultDeps()

    try {
        await db.chatSession.update({
            where: { id: sessionId },
            // Prisma requires JsonNull sentinel to write SQL NULL into a Json field;
            // plain `null` is forbidden by the type system.
            data: { lastError: Prisma.JsonNull, lastErrorAt: null },
            select: { id: true },
        })
    } catch (err) {
        if (isPrismaNotFoundError(err)) return
        throw err
    }
}

export async function loadSessionError(
    sessionId: string,
    deps?: SessionDeps,
): Promise<SessionErrorRecord | null> {
    const { db } = deps ?? getDefaultDeps()

    const row = await db.chatSession.findUnique({
        where: { id: sessionId },
        select: { lastError: true },
    })

    if (!row) {
        throw new SessionError('Session not found', 'NOT_FOUND')
    }

    const raw = row.lastError
    if (raw == null) return null

    // Prisma returns JsonValue. We wrote a flat object; narrow defensively.
    if (
        typeof raw !== 'object' ||
        Array.isArray(raw) ||
        typeof (raw as { message?: unknown }).message !== 'string' ||
        typeof (raw as { name?: unknown }).name !== 'string'
    ) {
        return null
    }

    const rec = raw as { message: string; name: string; code?: unknown }
    return {
        message: rec.message,
        name: rec.name,
        code: typeof rec.code === 'string' ? rec.code : undefined,
    }
}

// --- Transcript Loading ---

/**
 * Load messages with DB timestamps for transcript cleaning.
 * UIMessage has no createdAt — timestamps come from ChatMessage table.
 */
export async function loadMessagesForTranscript(
    sessionId: string,
    deps?: SessionDeps,
): Promise<TranscriptMessage[]> {
    const { db } = deps ?? getDefaultDeps()

    const rows = await db.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
    })

    return rows.flatMap((row) => {
        try {
            return [
                {
                    message: JSON.parse(row.content) as UIMessage,
                    createdAt: row.createdAt,
                },
            ]
        } catch {
            console.error(
                `[session] corrupted message ${row.id} in session ${sessionId}, skipping`,
            )
            return []
        }
    })
}

// --- Truncation ---

export function truncateMessages(messages: UIMessage[]): UIMessage[] {
    if (messages.length <= TRUNCATE_LIMIT) return messages
    return messages.slice(-TRUNCATE_LIMIT)
}
