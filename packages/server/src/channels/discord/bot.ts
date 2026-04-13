import { Client, Partials } from 'discord.js'
import { WebSocketShardEvents } from '@discordjs/ws'
import type { ChannelAdapter, ChannelMessage, ChannelTarget } from '@/channels/types'
import type { Gateway } from '@/gateway/gateway'
import type { DiscordConfig } from './config'
import { CommandRegistry } from './commands/index'
import { clearCommand } from './commands/clear'
import { splitMessage } from './formatter'
import { toGatewayInput } from './handlers'

export interface DiscordHealthStatus {
    readonly status: 'healthy' | 'unhealthy'
    readonly reason?: string
    readonly details?: string
    readonly checkedAt: string
}

export class DiscordAdapter implements ChannelAdapter {
    readonly type = 'discord' as const
    private client: Client | null = null
    private lastGatewayActivityAtMs = 0

    private static readonly healthWindowMs = 120_000

    constructor(
        private readonly config: DiscordConfig,
        private readonly gateway: Gateway,
    ) {}

    async start(): Promise<void> {
        const client = new Client({
            intents: [...this.config.intents],
            partials: [Partials.Channel],
        })
        this.client = client
        this.lastGatewayActivityAtMs = 0

        const registry = new CommandRegistry({ gateway: this.gateway })
        registry.add(clearCommand)

        client.once('clientReady', async () => {
            this.markGatewayActivity()
            try {
                await registry.register(client)
                console.log('Slash commands registered')
            } catch (error) {
                console.error('Failed to register slash commands:', error)
            }
        })

        client.on('interactionCreate', async (interaction) => {
            this.markGatewayActivity()
            if (!interaction.isChatInputCommand()) return
            await registry.handle(interaction)
        })

        client.on('messageCreate', async (msg) => {
            this.markGatewayActivity()
            const gatewayInput = toGatewayInput(msg, client.user!.id)
            if (!gatewayInput) return

            await msg.channel.sendTyping()

            // Keep typing indicator alive (Discord expires after ~10s)
            const typingInterval = setInterval(async () => {
                try { await msg.channel.sendTyping() } catch { /* ignore */ }
            }, 8_000)

            // 120s soft notification for long-running responses
            const softTimer = setTimeout(async () => {
                try { await msg.reply('⏳ 仍在处理中，请稍候...') } catch { /* ignore */ }
            }, 120_000)

            try {
                const output = await this.gateway.chat(gatewayInput)
                const { text } = await output.consumeStream()
                clearTimeout(softTimer)
                clearInterval(typingInterval)

                const chunks = splitMessage(text)
                for (const chunk of chunks) {
                    await msg.reply(chunk)
                }
            } catch (error) {
                clearTimeout(softTimer)
                clearInterval(typingInterval)
                console.error('Discord message handling error:', error)
                try {
                    await msg.reply('Sorry, something went wrong. Please try again.')
                } catch { /* ignore reply failure */ }
            }
        })

        this.client.on('error', (error) => {
            console.error('Discord client error:', error)
        })

        // Keep the health window fresh whenever the Discord gateway acks a heartbeat.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(client.ws as any).on(WebSocketShardEvents.HeartbeatComplete, () => {
            this.markGatewayActivity()
        })

        await client.login(this.config.token)
        console.log(`Discord bot logged in as ${client.user?.tag}`)
    }

    async stop(): Promise<void> {
        const client = this.client
        this.client = null
        this.lastGatewayActivityAtMs = 0

        if (!client) return

        await client.destroy()
    }

    async checkHealth(): Promise<DiscordHealthStatus> {
        const checkedAt = new Date().toISOString()
        const client = this.client

        if (!client || !client.isReady()) {
            return {
                status: 'unhealthy',
                reason: 'client_not_ready',
                details: 'discord client is not ready',
                checkedAt,
            }
        }

        if (!client.ws) {
            return {
                status: 'unhealthy',
                reason: 'gateway_disconnected',
                details: 'discord gateway websocket is not available',
                checkedAt,
            }
        }

        const lastGatewayActivityAtMs = this.lastGatewayActivityAtMs
        const activityAgeMs = lastGatewayActivityAtMs > 0 ? Date.now() - lastGatewayActivityAtMs : Number.POSITIVE_INFINITY
        const ping = typeof client.ws?.ping === 'number' && Number.isFinite(client.ws.ping)
            ? `${Math.round(client.ws.ping)}ms`
            : 'unknown'

        if (activityAgeMs > DiscordAdapter.healthWindowMs) {
            return {
                status: 'unhealthy',
                reason: 'no_recent_gateway_event',
                details: `last gateway activity ${Number.isFinite(activityAgeMs) ? `${Math.round(activityAgeMs / 1000)}s ago` : 'never'}; client.ws.ping=${ping}`,
                checkedAt,
            }
        }

        return {
            status: 'healthy',
            details: `last gateway activity ${Math.max(0, Math.round(activityAgeMs / 1000))}s ago; client.ws.ping=${ping}`,
            checkedAt,
        }
    }

    async recoverHealth(): Promise<void> {
        try {
            await this.stop()
        } catch (error) {
            console.error('Discord recovery stop failed:', error)
        }

        await this.start()
    }

    async send(target: ChannelTarget, message: ChannelMessage): Promise<void> {
        if (!this.client) return

        const channel = await this.client.channels.fetch(target.channelId)
        if (!channel?.isSendable()) return

        const chunks = splitMessage(message.content)
        for (const chunk of chunks) {
            await channel.send(chunk)
        }
    }

    private markGatewayActivity(): void {
        this.lastGatewayActivityAtMs = Date.now()
    }
}
