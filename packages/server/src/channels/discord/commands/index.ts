import type { ChatInputCommandInteraction, Client } from 'discord.js'
import { MessageFlags } from 'discord.js'
import type { CommandContext, SlashCommand } from './types'

export class CommandRegistry {
    private readonly commands = new Map<string, SlashCommand>()

    constructor(private readonly ctx: CommandContext) {}

    add(cmd: SlashCommand): void {
        this.commands.set(cmd.definition.name, cmd)
    }

    async register(client: Client): Promise<void> {
        if (!client.application) {
            throw new Error('Discord application is not ready')
        }

        await client.application.commands.set(
            [...this.commands.values()].map((c) => c.definition),
        )
    }

    async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        const cmd = this.commands.get(interaction.commandName)
        if (!cmd) return

        try {
            await cmd.execute(interaction, this.ctx)
        } catch (error) {
            console.error(
                `Slash command /${interaction.commandName} failed:`,
                error,
            )
            const reply =
                interaction.replied || interaction.deferred
                    ? interaction.followUp.bind(interaction)
                    : interaction.reply.bind(interaction)
            await reply({
                content: 'Something went wrong.',
                flags: MessageFlags.Ephemeral,
            }).catch((e) =>
                console.error('[discord] failed to send error reply:', e),
            )
        }
    }
}
