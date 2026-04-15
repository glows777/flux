/**
 * P3 Session CRUD + Message Persistence Unit Tests
 *
 * Tests:
 * - listSessions: 按 updatedAt DESC 返回会话列表
 * - createSession: 正确截取 title 前 20 字
 * - deleteSession: 正常删除, 不存在抛 NOT_FOUND
 * - renameSession: 正常重命名, title 为空抛 INVALID_INPUT
 * - loadMessages: 返回 JSON.parse 后的 UIMessage[]
 * - truncateMessages: 截断策略
 */

import { describe, expect, it, mock } from 'bun:test'
import type { SessionDeps } from '@/core/ai/session'

// ==================== Mock Prisma 工厂 ====================

function createMockDb() {
    return {
        chatSession: {
            findMany: mock(() => Promise.resolve([])),
            count: mock(() => Promise.resolve(0)),
            create: mock(() =>
                Promise.resolve({
                    id: 'session-1',
                    symbol: 'AAPL',
                    title: '请问现在的估值和竞品相比如何',
                    createdAt: new Date('2024-06-01'),
                    updatedAt: new Date('2024-06-01'),
                }),
            ),
            delete: mock(() =>
                Promise.resolve({
                    id: 'session-1',
                    symbol: 'AAPL',
                    title: 'Test Session',
                    createdAt: new Date('2024-06-01'),
                    updatedAt: new Date('2024-06-01'),
                }),
            ),
            update: mock(() =>
                Promise.resolve({
                    id: 'session-1',
                    symbol: 'AAPL',
                    title: 'New Title',
                    createdAt: new Date('2024-06-01'),
                    updatedAt: new Date('2024-06-01'),
                }),
            ),
        },
        chatMessage: {
            findMany: mock(() => Promise.resolve([])),
            create: mock(() => Promise.resolve({})),
        },
    }
}

// ==================== createSession ====================

describe('createSession', () => {
    it('T03-03: 正常创建会话，title 截取前 20 字', async () => {
        const { createSession } = await import('@/core/ai/session')
        const db = createMockDb()
        const longMessage = '请问现在的估值和竞品相比如何，能否详细分析一下'
        const expectedTitle = longMessage.slice(0, 20)
        db.chatSession.count.mockImplementation(() => Promise.resolve(5))
        db.chatSession.create.mockImplementation(
            (args: { data: { symbol: string; title: string } }) =>
                Promise.resolve({
                    id: 'session-new',
                    symbol: args.data.symbol,
                    title: args.data.title,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }),
        )
        const deps = { db } as unknown as SessionDeps

        const session = await createSession('AAPL', longMessage, deps)

        expect(session.title).toBe(expectedTitle)
        expect(session.symbol).toBe('AAPL')
        expect(db.chatSession.create).toHaveBeenCalledWith({
            data: { symbol: 'AAPL', title: expectedTitle },
        })
    })
})

// ==================== deleteSession ====================

describe('deleteSession', () => {
    it('T03-05: 正常删除 (Cascade 由 Prisma 处理)', async () => {
        const { deleteSession } = await import('@/core/ai/session')
        const db = createMockDb()
        db.chatSession.delete.mockImplementation(() =>
            Promise.resolve({
                id: 'session-1',
                symbol: 'AAPL',
                title: 'Test',
                createdAt: new Date(),
                updatedAt: new Date(),
            }),
        )
        const deps = { db } as unknown as SessionDeps

        await deleteSession('session-1', deps)

        expect(db.chatSession.delete).toHaveBeenCalledWith({
            where: { id: 'session-1' },
        })
    })

    it('T03-06: session 不存在时抛 NOT_FOUND', async () => {
        const { deleteSession, SessionError } = await import(
            '@/core/ai/session'
        )
        const db = createMockDb()
        const prismaNotFound = new Error('Record not found')
        Object.assign(prismaNotFound, { code: 'P2025' })
        db.chatSession.delete.mockImplementation(() =>
            Promise.reject(prismaNotFound),
        )
        const deps = { db } as unknown as SessionDeps

        try {
            await deleteSession('nonexistent', deps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'NOT_FOUND',
            )
        }
    })
})

// ==================== renameSession ====================

describe('renameSession', () => {
    it('T03-07: 正常重命名', async () => {
        const { renameSession } = await import('@/core/ai/session')
        const db = createMockDb()
        db.chatSession.update.mockImplementation(() =>
            Promise.resolve({
                id: 'session-1',
                symbol: 'AAPL',
                title: 'New Title',
                createdAt: new Date(),
                updatedAt: new Date(),
            }),
        )
        const deps = { db } as unknown as SessionDeps

        const result = await renameSession('session-1', 'New Title', deps)

        expect(result.title).toBe('New Title')
        expect(db.chatSession.update).toHaveBeenCalledWith({
            where: { id: 'session-1' },
            data: { title: 'New Title' },
        })
    })

    it('T03-08: title 为空时抛 INVALID_INPUT', async () => {
        const { renameSession, SessionError } = await import(
            '@/core/ai/session'
        )
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps

        try {
            await renameSession('session-1', '', deps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })

    it('title 超过 20 字时抛 INVALID_INPUT', async () => {
        const { renameSession, SessionError } = await import(
            '@/core/ai/session'
        )
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps

        try {
            await renameSession('session-1', 'a'.repeat(21), deps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })

    it('session 不存在时抛 NOT_FOUND', async () => {
        const { renameSession, SessionError } = await import(
            '@/core/ai/session'
        )
        const db = createMockDb()
        const prismaNotFound = new Error('Record not found')
        Object.assign(prismaNotFound, { code: 'P2025' })
        db.chatSession.update.mockImplementation(() =>
            Promise.reject(prismaNotFound),
        )
        const deps = { db } as unknown as SessionDeps

        try {
            await renameSession('nonexistent', 'Valid Title', deps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'NOT_FOUND',
            )
        }
    })
})

// ==================== loadMessages ====================

describe('loadMessages', () => {
    it('T03-09: 返回 JSON.parse 后的 UIMessage[]', async () => {
        const { loadMessages } = await import('@/core/ai/session')
        const db = createMockDb()
        const mockMessages = [
            {
                id: 'msg-1',
                sessionId: 'session-1',
                content: JSON.stringify({
                    id: 'ui-1',
                    role: 'user',
                    parts: [{ type: 'text', text: 'hello' }],
                }),
                createdAt: new Date('2024-06-01T00:00:00Z'),
            },
            {
                id: 'msg-2',
                sessionId: 'session-1',
                content: JSON.stringify({
                    id: 'ui-2',
                    role: 'assistant',
                    parts: [{ type: 'text', text: 'hi there' }],
                }),
                createdAt: new Date('2024-06-01T00:01:00Z'),
            },
        ]
        db.chatMessage.findMany.mockImplementation(() =>
            Promise.resolve(mockMessages),
        )
        const deps = { db } as unknown as SessionDeps

        const result = await loadMessages('session-1', deps)

        expect(result).toHaveLength(2)
        expect(result[0].role).toBe('user')
        expect(result[1].role).toBe('assistant')
        expect(db.chatMessage.findMany).toHaveBeenCalledWith({
            where: { sessionId: 'session-1' },
            orderBy: { createdAt: 'asc' },
        })
    })

    it('session 无消息时返回空数组', async () => {
        const { loadMessages } = await import('@/core/ai/session')
        const db = createMockDb()
        db.chatMessage.findMany.mockImplementation(() => Promise.resolve([]))
        const deps = { db } as unknown as SessionDeps

        const result = await loadMessages('session-1', deps)

        expect(result).toEqual([])
    })
})

// ==================== appendMessage ====================

describe('appendMessage', () => {
    it('T03-12: 单条消息写入 (upsert with messageId)', async () => {
        const { appendMessage } = await import('@/core/ai/session')
        const mockUpsert = mock(() => Promise.resolve({}))
        const db = createMockDb()
        db.chatMessage.upsert = mockUpsert
        const deps = { db } as unknown as SessionDeps

        const message = {
            id: 'ui-3',
            role: 'assistant' as const,
            parts: [{ type: 'text' as const, text: 'response' }],
        }

        await appendMessage('session-1', message as never, deps)

        expect(mockUpsert).toHaveBeenCalledTimes(1)
        expect(mockUpsert).toHaveBeenCalledWith({
            where: {
                sessionId_messageId: {
                    sessionId: 'session-1',
                    messageId: 'ui-3',
                },
            },
            create: {
                sessionId: 'session-1',
                messageId: 'ui-3',
                content: JSON.stringify(message),
            },
            update: {
                content: JSON.stringify(message),
            },
        })
    })
})

// ==================== clearChannelSession ====================

describe('clearChannelSession', () => {
    type ClearSessionCreateArgs = {
        data: {
            channel: string
            sourceId: string
            createdBy: string
            title: string
        }
        select: {
            id: true
        }
    }

    it('creates a new session with channel metadata', async () => {
        const { clearChannelSession } = await import('@/core/ai/session')
        const db = createMockDb()
        db.chatSession.create.mockImplementation(
            (_args: ClearSessionCreateArgs) =>
                Promise.resolve({ id: 'new-session-1' }),
        )
        const deps = { db } as unknown as SessionDeps

        const result = await clearChannelSession(
            {
                channel: 'discord',
                sourceId: 'guild-1:channel-1',
                createdBy: 'user-1',
            },
            deps,
        )

        expect(result.id).toBe('new-session-1')
        expect(db.chatSession.create).toHaveBeenCalledTimes(1)

        const createArgs = db.chatSession.create.mock
            .calls[0][0] as ClearSessionCreateArgs
        expect(createArgs.data.channel).toBe('discord')
        expect(createArgs.data.sourceId).toBe('guild-1:channel-1')
        expect(createArgs.data.createdBy).toBe('user-1')
        expect(createArgs.select).toEqual({ id: true })
    })

    it('title contains channel name and human-readable time', async () => {
        const { clearChannelSession } = await import('@/core/ai/session')
        const db = createMockDb()
        db.chatSession.create.mockImplementation(
            (_args: ClearSessionCreateArgs) =>
                Promise.resolve({ id: 'new-session-2' }),
        )
        const deps = { db } as unknown as SessionDeps

        await clearChannelSession(
            {
                channel: 'discord',
                sourceId: 'user-1',
                createdBy: 'user-1',
            },
            deps,
        )

        const createArgs = db.chatSession.create.mock
            .calls[0][0] as ClearSessionCreateArgs
        const title: string = createArgs.data.title
        expect(title).toStartWith('discord - created at ')
        expect(title).not.toContain('T') // not ISO timestamp
    })
})

// ==================== truncateMessages ====================

describe('truncateMessages', () => {
    it('T03-11: messages <= 20 条时不截断', async () => {
        const { truncateMessages } = await import('@/core/ai/session')
        const messages = Array.from({ length: 20 }, (_, i) => ({
            id: `msg-${i}`,
            role: 'user' as const,
            parts: [{ type: 'text' as const, text: `message ${i}` }],
        }))

        const result = truncateMessages(messages as never[])

        expect(result).toHaveLength(20)
    })

    it('T03-12: messages > 20 条时只保留最近 20 条', async () => {
        const { truncateMessages } = await import('@/core/ai/session')
        const messages = Array.from({ length: 30 }, (_, i) => ({
            id: `msg-${i}`,
            role: 'user' as const,
            parts: [{ type: 'text' as const, text: `message ${i}` }],
        }))

        const result = truncateMessages(messages as never[])

        expect(result).toHaveLength(20)
        expect((result[0] as { id: string }).id).toBe('msg-10')
        expect((result[19] as { id: string }).id).toBe('msg-29')
    })
})
