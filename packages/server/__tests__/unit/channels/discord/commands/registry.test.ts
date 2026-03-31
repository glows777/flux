import { describe, expect, test, mock } from 'bun:test'
import { CommandRegistry } from '@/channels/discord/commands/index'
import type { SlashCommand, CommandContext } from '@/channels/discord/commands/types'

function createMockCommand(name: string): SlashCommand {
    return {
        definition: { name, toJSON: () => ({ name }) } as any,
        execute: mock(async () => {}),
    }
}

function createMockContext(): CommandContext {
    return {
        gateway: {} as any,
    }
}

function createMockInteraction(commandName: string) {
    return {
        commandName,
        replied: false,
        deferred: false,
        reply: mock(async () => {}),
        followUp: mock(async () => {}),
    } as any
}

describe('CommandRegistry', () => {
    test('handle routes to correct command', async () => {
        const ctx = createMockContext()
        const registry = new CommandRegistry(ctx)
        const cmd = createMockCommand('clear')
        registry.add(cmd)

        const interaction = createMockInteraction('clear')
        await registry.handle(interaction)

        expect(cmd.execute).toHaveBeenCalledTimes(1)
        expect((cmd.execute as any).mock.calls[0][0]).toBe(interaction)
        expect((cmd.execute as any).mock.calls[0][1]).toBe(ctx)
    })

    test('handle ignores unknown commands', async () => {
        const registry = new CommandRegistry(createMockContext())
        const interaction = createMockInteraction('unknown')
        await registry.handle(interaction)
    })

    test('handle catches errors and replies ephemeral', async () => {
        const registry = new CommandRegistry(createMockContext())
        const cmd = createMockCommand('fail')
        ;(cmd.execute as any).mockRejectedValue(new Error('boom'))
        registry.add(cmd)

        const interaction = createMockInteraction('fail')
        await registry.handle(interaction)

        expect(interaction.reply).toHaveBeenCalledTimes(1)
        const replyArg = (interaction.reply as any).mock.calls[0][0]
        expect(replyArg.content).toBe('Something went wrong.')
    })

    test('handle uses followUp when interaction is already deferred', async () => {
        const registry = new CommandRegistry(createMockContext())
        const cmd = createMockCommand('fail')
        ;(cmd.execute as any).mockRejectedValue(new Error('boom'))
        registry.add(cmd)

        const interaction = createMockInteraction('fail')
        interaction.deferred = true
        await registry.handle(interaction)

        expect(interaction.reply).not.toHaveBeenCalled()
        expect(interaction.followUp).toHaveBeenCalledTimes(1)
    })

    test('register calls client.application.commands.set', async () => {
        const registry = new CommandRegistry(createMockContext())
        registry.add(createMockCommand('clear'))
        registry.add(createMockCommand('help'))

        const mockSet = mock(async () => {})
        const client = {
            application: { commands: { set: mockSet } },
        } as any

        await registry.register(client)

        expect(mockSet).toHaveBeenCalledTimes(1)
        const defs = (mockSet as any).mock.calls[0][0]
        expect(defs).toHaveLength(2)
    })
})
