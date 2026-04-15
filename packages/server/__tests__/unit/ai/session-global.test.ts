import { beforeEach, describe, expect, mock, test } from 'bun:test'
import {
    createSession,
    listAllSessions,
    type SessionDeps,
} from '@/core/ai/session'

function createMockDb() {
    return {
        chatSession: {
            findMany: mock(() => Promise.resolve([])),
            create: mock(() =>
                Promise.resolve({
                    id: 'ses_1',
                    symbol: null,
                    title: '你好',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }),
            ),
        },
    }
}

describe('listAllSessions', () => {
    let mockDb: ReturnType<typeof createMockDb>
    let deps: SessionDeps

    beforeEach(() => {
        mockDb = createMockDb()
        deps = { db: mockDb as unknown as SessionDeps['db'] }
    })

    test('returns all sessions ordered by updatedAt desc', async () => {
        const sessions = [
            {
                id: '1',
                symbol: 'AAPL',
                title: 'test',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: '2',
                symbol: null,
                title: 'general',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ]
        mockDb.chatSession.findMany.mockResolvedValueOnce(sessions)

        const result = await listAllSessions(deps)

        expect(result).toEqual(sessions)
        expect(mockDb.chatSession.findMany).toHaveBeenCalledWith({
            orderBy: { updatedAt: 'desc' },
        })
    })
})

describe('createSession with null symbol', () => {
    let mockDb: ReturnType<typeof createMockDb>
    let deps: SessionDeps

    beforeEach(() => {
        mockDb = createMockDb()
        deps = { db: mockDb as unknown as SessionDeps['db'] }
    })

    test('creates session with null symbol', async () => {
        const result = await createSession(null, '你好世界', deps)

        expect(result.symbol).toBeNull()
        expect(mockDb.chatSession.create).toHaveBeenCalledWith({
            data: { symbol: null, title: '你好世界' },
        })
    })

    test('creates session with symbol', async () => {
        mockDb.chatSession.create.mockResolvedValueOnce({
            id: 'ses_2',
            symbol: 'AAPL',
            title: 'AAPL分析',
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        const result = await createSession('AAPL', 'AAPL分析', deps)

        expect(result.symbol).toBe('AAPL')
        expect(mockDb.chatSession.create).toHaveBeenCalledWith({
            data: { symbol: 'AAPL', title: 'AAPL分析' },
        })
    })
})
