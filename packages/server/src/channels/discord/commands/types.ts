import type {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
} from 'discord.js'
import type { GatewayRouter } from '@/gateway/router'

export interface CommandContext {
    readonly gateway: GatewayRouter
}

export interface SlashCommand {
    readonly definition: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder
    execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void>
}
