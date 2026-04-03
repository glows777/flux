import type {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
} from 'discord.js'
import type { Gateway } from '@/gateway/gateway'

export interface CommandContext {
    readonly gateway: Gateway
}

export interface SlashCommand {
    readonly definition: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder
    execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void>
}
