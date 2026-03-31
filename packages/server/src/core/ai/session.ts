/**
 * Phase 3: Session CRUD + Message Persistence
 *
 * 会话管理业务逻辑 + 消息读写辅助函数。
 * 所有函数通过 deps 参数支持测试替换。
 */

import type { PrismaClient } from '@prisma/client'
import type { UIMessage } from 'ai'
import { prisma as defaultPrisma } from '@/core/db'
import type { TranscriptMessage } from './memory/types'

// --- Constants ---

import { TRUNCATE_LIMIT } from './constants'

const TITLE_MAX_LENGTH = 20

export { TRUNCATE_LIMIT }

// --- Error Handling ---

export type SessionErrorCode = 'NOT_FOUND' | 'INVALID_INPUT'

export class SessionError extends Error {
    constructor(
        message: string,
        public readonly code: SessionErrorCode,
    ) {
        super(message)
        this.name = 'SessionError'
        Object.setPrototypeOf(this, SessionError.prototype)
    }
}

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

export async function createSession(symbol: string | null, firstMessage: string, deps?: SessionDeps) {
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

export async function renameSession(id: string, title: string, deps?: SessionDeps) {
    const { db } = deps ?? getDefaultDeps()

    if (!title || title.length === 0) {
        throw new SessionError('Title must not be empty', 'INVALID_INPUT')
    }
    if (title.length > TITLE_MAX_LENGTH) {
        throw new SessionError(`Title must not exceed ${TITLE_MAX_LENGTH} characters`, 'INVALID_INPUT')
    }

    try {
        return await db.chatSession.update({
            where: { id },
            data: { title },
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
 * 这是 /clear 命令的底层实现——在同一个 channelSessionId 下
 * 创建一条新的 ChatSession，下次 resolveSession 自然取到它。
 */
export async function clearChannelSession(
    params: {
        readonly channel: string
        readonly channelSessionId: string
        readonly channelUserId: string
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
            channelSessionId: params.channelSessionId,
            channelUserId: params.channelUserId,
            title,
        },
        select: { id: true },
    })
}

// --- Message Persistence ---

export async function loadMessages(sessionId: string, deps?: SessionDeps): Promise<UIMessage[]> {
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

export async function appendMessage(sessionId: string, message: UIMessage, deps?: SessionDeps): Promise<void> {
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

    return rows.map((row) => ({
        message: JSON.parse(row.content) as UIMessage,
        createdAt: row.createdAt,
    }))
}

// --- Truncation ---

export function truncateMessages(messages: UIMessage[]): UIMessage[] {
    if (messages.length <= TRUNCATE_LIMIT) return messages
    return messages.slice(-TRUNCATE_LIMIT)
}
