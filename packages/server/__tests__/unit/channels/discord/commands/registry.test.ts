import { describe, expect, mock, test } from 'bun:test'
import type {
    ChatInputCommandInteraction,
    Client,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
} from 'discord.js'
import { CommandRegistry } from '@/channels/discord/commands/index'
import type {
    CommandContext,
    SlashCommand,
} from '@/channels/discord/commands/types'

type CommandDefinition = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder

function createMockCommand(name: string) {
    const executeMock = mock(async () => {})
    const command: SlashCommand = {
        definition: {
            name,
            toJSON: () => ({ name }),
        } as unknown as CommandDefinition,
        execute: executeMock,
    }
    return { command, executeMock }
}

function createMockContext(): CommandContext {
    return {
        gateway: {} as CommandContext['gateway'],
    }
}

function createMockInteraction(commandName: string) {
    const replyMock = mock(async () => {})
    const followUpMock = mock(async () => {})
    const interaction = {
        commandName,
        replied: false,
        deferred: false,
        reply: replyMock,
        followUp: followUpMock,
    } as unknown as ChatInputCommandInteraction

    return { interaction, replyMock, followUpMock }
}

describe('CommandRegistry', () => {
    test('handle routes to correct command', async () => {
        const ctx = createMockContext()
        const registry = new CommandRegistry(ctx)
        const { command, executeMock } = createMockCommand('clear')
        registry.add(command)

        const { interaction } = createMockInteraction('clear')
        await registry.handle(interaction)

        expect(executeMock).toHaveBeenCalledTimes(1)
        expect(executeMock.mock.calls[0]?.[0]).toBe(interaction)
        expect(executeMock.mock.calls[0]?.[1]).toBe(ctx)
    })

    test('handle ignores unknown commands', async () => {
        const registry = new CommandRegistry(createMockContext())
        const { interaction } = createMockInteraction('unknown')
        await registry.handle(interaction)
    })

    test('handle catches errors and replies ephemeral', async () => {
        const registry = new CommandRegistry(createMockContext())
        const { command, executeMock } = createMockCommand('fail')
        executeMock.mockRejectedValue(new Error('boom'))
        registry.add(command)

        const { interaction, replyMock } = createMockInteraction('fail')
        await registry.handle(interaction)

        expect(replyMock).toHaveBeenCalledTimes(1)
        const replyArg = replyMock.mock.calls[0]?.[0]
        expect(replyArg?.content).toBe('Something went wrong.')
    })

    test('handle uses followUp when interaction is already deferred', async () => {
        const registry = new CommandRegistry(createMockContext())
        const { command, executeMock } = createMockCommand('fail')
        executeMock.mockRejectedValue(new Error('boom'))
        registry.add(command)

        const { interaction, replyMock, followUpMock } =
            createMockInteraction('fail')
        interaction.deferred = true
        await registry.handle(interaction)

        expect(replyMock).not.toHaveBeenCalled()
        expect(followUpMock).toHaveBeenCalledTimes(1)
    })

    test('register calls client.application.commands.set', async () => {
        const registry = new CommandRegistry(createMockContext())
        registry.add(createMockCommand('clear').command)
        registry.add(createMockCommand('help').command)

        const mockSet = mock(async () => {})
        const client = {
            application: { commands: { set: mockSet } },
        } as unknown as Client

        await registry.register(client)

        expect(mockSet).toHaveBeenCalledTimes(1)
        const defs = mockSet.mock.calls[0]?.[0]
        expect(defs).toHaveLength(2)
    })
})
