import type { Message } from 'discord.js'
import type { GatewayInput } from '@/gateway/router'
import { buildSourceId } from './identity'

export function toGatewayInput(msg: Message, botUserId: string): GatewayInput | null {
    if (msg.author.bot) return null

    if (msg.guild) {
        if (!msg.mentions.has(botUserId)) return null
    }

    const content = msg.content.replace(/<@!?[\w-]+>/g, '').trim()
    if (!content) return null

    return {
        channel: 'discord',
        mode: 'conversation',
        content,
        sourceId: buildSourceId({
            guildId: msg.guild?.id ?? null,
            channelId: msg.channel.id,
            userId: msg.author.id,
        }),
        userId: msg.author.id,
    }
}
