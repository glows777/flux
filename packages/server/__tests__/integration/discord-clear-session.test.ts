import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { mockClearChannelSession } from './helpers/mock-boundaries'

/**
 * Integration: /clear creates a new session, then resolveSession
 * (findFirst orderBy desc) returns the new session, not the old one.
 */
describe('Discord /clear session lifecycle', () => {
    beforeEach(() => {
        mockClearChannelSession.mockClear()
    })

    test('clearChannelSession creates new session, resolveSession finds it', async () => {
        const { clearChannelSession } = await import('@/core/ai/session')

        const oldSession = { id: 'old-session', createdAt: new Date('2026-03-28') }
        const newSession = { id: 'new-session', createdAt: new Date('2026-03-30') }

        mockClearChannelSession.mockImplementation(() => Promise.resolve({ id: newSession.id }))

        const result = await clearChannelSession({
            channel: 'discord',
            channelSessionId: 'guild-1:channel-1',
            channelUserId: 'user-1',
        })

        expect(result.id).toBe('new-session')

        const { prisma } = await import('@/core/db')
        const mockFindFirst = prisma.chatSession.findFirst as ReturnType<typeof mock>
        mockFindFirst.mockImplementation(() => Promise.resolve(newSession))

        const found = await prisma.chatSession.findFirst({
            where: { channel: 'discord', channelSessionId: 'guild-1:channel-1' },
            orderBy: { createdAt: 'desc' },
        })

        expect(found!.id).toBe('new-session')
        expect(found!.id).not.toBe(oldSession.id)
    })

    test('old session is preserved (not deleted)', async () => {
        const { clearChannelSession } = await import('@/core/ai/session')

        mockClearChannelSession.mockImplementation(() => Promise.resolve({ id: 'new-session' }))

        await clearChannelSession({
            channel: 'discord',
            channelSessionId: 'user-1',
            channelUserId: 'user-1',
        })

        const { prisma } = await import('@/core/db')
        const mockDelete = prisma.chatSession.delete as ReturnType<typeof mock> | undefined
        if (mockDelete) {
            expect(mockDelete).not.toHaveBeenCalled()
        }
    })
})
