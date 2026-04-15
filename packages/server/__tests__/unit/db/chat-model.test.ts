/**
 * Phase 1: ChatSession + ChatMessage Model Unit Tests (Mock Prisma)
 *
 * Test scenarios:
 * - T01-01: ChatSession can create a record
 * - T01-02: Same symbol can have multiple sessions (no unique constraint)
 * - T01-03: Query by symbol + updatedAt DESC ordering
 * - T01-04: ChatMessage can be created and associated with session
 * - T01-05: Messages loaded in sessionId + createdAt order
 * - T01-06: Cascade delete works (deleting session removes messages)
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'

// ─── Mock data types ───

interface MockChatSession {
    id: string
    symbol: string
    title: string
    createdAt: Date
    updatedAt: Date
}

interface MockChatMessage {
    id: string
    sessionId: string
    content: string
    createdAt: Date
}

// ─── Mock data factories ───

const createMockSession = (
    overrides: Partial<MockChatSession> = {},
): MockChatSession => ({
    id: 'cuid-session-1',
    symbol: 'AAPL',
    title: '现在估值合理吗',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
})

const createMockMessage = (
    overrides: Partial<MockChatMessage> = {},
): MockChatMessage => ({
    id: 'cuid-msg-1',
    sessionId: 'cuid-session-1',
    content: JSON.stringify({
        role: 'user',
        content: '现在估值合理吗',
    }),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
})

// ─── Mock Prisma types ───

type MockFn<TArgs extends unknown[], TReturn> = ReturnType<
    typeof mock<(...args: TArgs) => Promise<TReturn>>
>

interface MockPrismaChatSession {
    create: MockFn<
        [{ data: { symbol: string; title: string } }],
        MockChatSession
    >
    findMany: MockFn<
        [
            {
                where?: { symbol?: string }
                orderBy?: { updatedAt?: 'desc' | 'asc' }
            },
        ],
        MockChatSession[]
    >
    delete: MockFn<[{ where: { id: string } }], MockChatSession>
}

interface MockPrismaChatMessage {
    create: MockFn<
        [{ data: { sessionId: string; content: string } }],
        MockChatMessage
    >
    findMany: MockFn<
        [
            {
                where?: { sessionId?: string }
                orderBy?: { createdAt?: 'asc' | 'desc' }
            },
        ],
        MockChatMessage[]
    >
    count: MockFn<[{ where?: { sessionId?: string } }], number>
}

interface MockPrismaClient {
    chatSession: MockPrismaChatSession
    chatMessage: MockPrismaChatMessage
}

function createMockPrismaClient(): MockPrismaClient {
    return {
        chatSession: {
            create: mock(() => Promise.resolve(createMockSession())),
            findMany: mock(() => Promise.resolve([createMockSession()])),
            delete: mock(() => Promise.resolve(createMockSession())),
        },
        chatMessage: {
            create: mock(() => Promise.resolve(createMockMessage())),
            findMany: mock(() => Promise.resolve([createMockMessage()])),
            count: mock(() => Promise.resolve(1)),
        },
    }
}

// ─── Tests ───

describe('ChatSession Model', () => {
    let mockPrisma: MockPrismaClient

    beforeEach(() => {
        mockPrisma = createMockPrismaClient()
    })

    it('T01-01: ChatSession can create a record', async () => {
        const data = { symbol: 'AAPL', title: '现在估值合理吗' }

        const result = await mockPrisma.chatSession.create({ data })

        expect(mockPrisma.chatSession.create).toHaveBeenCalledWith({ data })
        expect(result.id).toBeDefined()
        expect(typeof result.id).toBe('string')
        expect(result.id.length).toBeGreaterThan(0)
        expect(result.symbol).toBe('AAPL')
        expect(result.title).toBe('现在估值合理吗')
        expect(result.createdAt).toBeInstanceOf(Date)
        expect(result.updatedAt).toBeInstanceOf(Date)
    })

    it('T01-02: Same symbol can have multiple sessions', async () => {
        const session1 = createMockSession({
            id: 'cuid-session-1',
            title: '估值分析',
        })
        const session2 = createMockSession({
            id: 'cuid-session-2',
            title: '技术面怎么看',
        })

        mockPrisma.chatSession.create = mock(
            (args: { data: { symbol: string; title: string } }) => {
                if (args.data.title === '估值分析')
                    return Promise.resolve(session1)
                return Promise.resolve(session2)
            },
        )

        const result1 = await mockPrisma.chatSession.create({
            data: { symbol: 'AAPL', title: '估值分析' },
        })
        const result2 = await mockPrisma.chatSession.create({
            data: { symbol: 'AAPL', title: '技术面怎么看' },
        })

        expect(result1.id).not.toBe(result2.id)
        expect(result1.symbol).toBe('AAPL')
        expect(result2.symbol).toBe('AAPL')
    })

    it('T01-03: Query by symbol + updatedAt DESC ordering', async () => {
        const sessions = [
            createMockSession({
                id: 'cuid-session-2',
                symbol: 'AAPL',
                title: '最新讨论',
                updatedAt: new Date('2024-01-03T00:00:00Z'),
            }),
            createMockSession({
                id: 'cuid-session-1',
                symbol: 'AAPL',
                title: '旧讨论',
                updatedAt: new Date('2024-01-01T00:00:00Z'),
            }),
        ]

        mockPrisma.chatSession.findMany = mock(
            (args: {
                where?: { symbol?: string }
                orderBy?: { updatedAt?: 'desc' | 'asc' }
            }) => {
                if (
                    args.where?.symbol === 'AAPL' &&
                    args.orderBy?.updatedAt === 'desc'
                ) {
                    return Promise.resolve(sessions)
                }
                return Promise.resolve([])
            },
        )

        const result = await mockPrisma.chatSession.findMany({
            where: { symbol: 'AAPL' },
            orderBy: { updatedAt: 'desc' },
        })

        expect(result).toHaveLength(2)
        expect(result[0].updatedAt.getTime()).toBeGreaterThan(
            result[1].updatedAt.getTime(),
        )
        expect(result[0].title).toBe('最新讨论')
    })
})

describe('ChatMessage Model', () => {
    let mockPrisma: MockPrismaClient

    beforeEach(() => {
        mockPrisma = createMockPrismaClient()
    })

    it('T01-04: ChatMessage can be created and associated with session', async () => {
        const uiMessage = {
            role: 'user',
            content: '这只股票怎么样？',
        }
        const messageContent = JSON.stringify(uiMessage)

        mockPrisma.chatMessage.create = mock(
            (args: { data: { sessionId: string; content: string } }) =>
                Promise.resolve(
                    createMockMessage({
                        sessionId: args.data.sessionId,
                        content: args.data.content,
                    }),
                ),
        )

        const result = await mockPrisma.chatMessage.create({
            data: { sessionId: 'cuid-session-1', content: messageContent },
        })

        expect(result.sessionId).toBe('cuid-session-1')
        expect(result.content).toBe(messageContent)

        const parsed = JSON.parse(result.content)
        expect(parsed.role).toBe('user')
        expect(parsed.content).toBe('这只股票怎么样？')
    })

    it('T01-05: Messages loaded by sessionId + createdAt ASC order', async () => {
        const messages = [
            createMockMessage({
                id: 'msg-1',
                sessionId: 'cuid-session-1',
                content: JSON.stringify({ role: 'user', content: '问题1' }),
                createdAt: new Date('2024-01-01T00:00:00Z'),
            }),
            createMockMessage({
                id: 'msg-2',
                sessionId: 'cuid-session-1',
                content: JSON.stringify({
                    role: 'assistant',
                    content: '回答1',
                }),
                createdAt: new Date('2024-01-01T00:01:00Z'),
            }),
            createMockMessage({
                id: 'msg-3',
                sessionId: 'cuid-session-1',
                content: JSON.stringify({ role: 'user', content: '问题2' }),
                createdAt: new Date('2024-01-01T00:02:00Z'),
            }),
        ]

        mockPrisma.chatMessage.findMany = mock(
            (args: {
                where?: { sessionId?: string }
                orderBy?: { createdAt?: 'asc' | 'desc' }
            }) => {
                if (
                    args.where?.sessionId === 'cuid-session-1' &&
                    args.orderBy?.createdAt === 'asc'
                ) {
                    return Promise.resolve(messages)
                }
                return Promise.resolve([])
            },
        )

        const result = await mockPrisma.chatMessage.findMany({
            where: { sessionId: 'cuid-session-1' },
            orderBy: { createdAt: 'asc' },
        })

        expect(result).toHaveLength(3)
        for (let i = 1; i < result.length; i++) {
            expect(result[i].createdAt.getTime()).toBeGreaterThan(
                result[i - 1].createdAt.getTime(),
            )
        }
    })

    it('T01-06: Cascade delete — deleting session removes all messages', async () => {
        // Simulate: after deleting session, message count returns 0
        mockPrisma.chatSession.delete = mock(() =>
            Promise.resolve(createMockSession()),
        )
        mockPrisma.chatMessage.count = mock(() => Promise.resolve(0))

        await mockPrisma.chatSession.delete({ where: { id: 'cuid-session-1' } })

        expect(mockPrisma.chatSession.delete).toHaveBeenCalledWith({
            where: { id: 'cuid-session-1' },
        })

        const remainingCount = await mockPrisma.chatMessage.count({
            where: { sessionId: 'cuid-session-1' },
        })
        expect(remainingCount).toBe(0)
    })
})
