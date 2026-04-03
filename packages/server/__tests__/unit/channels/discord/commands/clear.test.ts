import { describe, expect, test, mock } from 'bun:test'
import { clearCommand } from '@/channels/discord/commands/clear'
import type { CommandContext } from '@/channels/discord/commands/types'

function createMockContext() {
    return {
        gateway: {
            chat: mock(async () => ({})),
            clearSession: mock(async () => ({ id: 'new-session-1' })),
        } as any,
    } satisfies CommandContext
}

function createMockInteraction(overrides: Record<string, any> = {}) {
    return {
        guild: null,
        channelId: 'dm-channel-1',
        user: { id: 'user-1' },
        reply: mock(async () => {}),
        ...overrides,
    } as any
}

describe('/clear command', () => {
    test('definition has name "clear" and no options', () => {
        expect(clearCommand.definition.name).toBe('clear')
        const json = clearCommand.definition.toJSON() as any
        expect(json.options ?? []).toHaveLength(0)
    })

    test('DM: calls gateway.clearSession with userId as sourceId', async () => {
        const ctx = createMockContext()
        const interaction = createMockInteraction()

        await clearCommand.execute(interaction, ctx)

        expect(ctx.gateway.clearSession).toHaveBeenCalledTimes(1)
        expect(ctx.gateway.clearSession).toHaveBeenCalledWith({
            channel: 'discord',
            sourceId: 'user-1',
            createdBy: 'user-1',
        })
    })

    test('Guild: calls gateway.clearSession with guildId:channelId as sourceId', async () => {
        const ctx = createMockContext()
        const interaction = createMockInteraction({
            guild: { id: 'guild-1' },
            channelId: 'channel-1',
        })

        await clearCommand.execute(interaction, ctx)

        expect(ctx.gateway.clearSession).toHaveBeenCalledWith({
            channel: 'discord',
            sourceId: 'guild-1:channel-1',
            createdBy: 'user-1',
        })
    })

    test('replies with ephemeral "Session cleared." message', async () => {
        const ctx = createMockContext()
        const interaction = createMockInteraction()

        await clearCommand.execute(interaction, ctx)

        expect(interaction.reply).toHaveBeenCalledTimes(1)
        const replyArg = interaction.reply.mock.calls[0][0]
        expect(replyArg.content).toBe('Session cleared.')
        expect(replyArg.flags).toBeDefined()
    })
})
