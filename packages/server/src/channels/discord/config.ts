import { GatewayIntentBits } from 'discord.js'

export interface DiscordConfig {
    readonly token: string
    readonly intents: readonly GatewayIntentBits[]
}

export function getDiscordConfig(): DiscordConfig | null {
    const token = process.env.DISCORD_BOT_TOKEN
    if (!token) return null

    return {
        token,
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages,
        ],
    }
}
