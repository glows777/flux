import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { SlashCommand, CommandContext } from './types'
import { buildChannelSessionId } from '../identity'

export const clearCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Start a new chat session'),

    async execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
        const channelSessionId = buildChannelSessionId({
            guildId: interaction.guild?.id ?? null,
            channelId: interaction.channelId,
            userId: interaction.user.id,
        })

        await ctx.gateway.clearSession({
            channel: 'discord',
            channelSessionId,
            channelUserId: interaction.user.id,
        })

        await interaction.reply({
            content: 'Session cleared.',
            flags: MessageFlags.Ephemeral,
        })
    },
}
