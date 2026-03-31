import { MessageFlags } from 'discord.js'
import type { Client, ChatInputCommandInteraction } from 'discord.js'
import type { SlashCommand, CommandContext } from './types'

export class CommandRegistry {
    private readonly commands = new Map<string, SlashCommand>()

    constructor(private readonly ctx: CommandContext) {}

    add(cmd: SlashCommand): void {
        this.commands.set(cmd.definition.name, cmd)
    }

    async register(client: Client): Promise<void> {
        await client.application!.commands.set(
            [...this.commands.values()].map((c) => c.definition),
        )
    }

    async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        const cmd = this.commands.get(interaction.commandName)
        if (!cmd) return

        try {
            await cmd.execute(interaction, this.ctx)
        } catch (error) {
            console.error(`Slash command /${interaction.commandName} failed:`, error)
            const reply = interaction.replied || interaction.deferred
                ? interaction.followUp.bind(interaction)
                : interaction.reply.bind(interaction)
            await reply({ content: 'Something went wrong.', flags: MessageFlags.Ephemeral }).catch(() => {})
        }
    }
}
