import { Client, Partials } from 'discord.js'
import { WebSocketShardEvents } from '@discordjs/ws'
import type { ChannelAdapter, ChannelMessage, ChannelTarget } from '@/channels/types'
import type { GatewayRouter } from '@/gateway/router'
import type { DiscordConfig } from './config'
import { CommandRegistry } from './commands/index'
import { clearCommand } from './commands/clear'
import { splitMessage } from './formatter'
import { toGatewayInput } from './handlers'

interface DiscordCallbacks {
    readonly onBeat?: () => void
    readonly onProgress?: () => void
}

export class DiscordAdapter implements ChannelAdapter {
    readonly type = 'discord' as const
    private client: Client | null = null
    private callbacks: DiscordCallbacks = {}

    constructor(
        private readonly config: DiscordConfig,
        private readonly gateway: GatewayRouter,
    ) {}

    async start(): Promise<void> {
        this.client = new Client({
            intents: [...this.config.intents],
            partials: [Partials.Channel],
        })

        const registry = new CommandRegistry({ gateway: this.gateway })
        registry.add(clearCommand)

        this.client.once('clientReady', async () => {
            try {
                await registry.register(this.client!)
                console.log('Slash commands registered')
            } catch (error) {
                console.error('Failed to register slash commands:', error)
            }
        })

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return
            await registry.handle(interaction)
        })

        this.client.on('messageCreate', async (msg) => {
            const gatewayInput = toGatewayInput(msg, this.client!.user!.id)
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

                this.callbacks.onProgress?.()
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(this.client.ws as any).on(WebSocketShardEvents.HeartbeatComplete, () => {
            this.callbacks.onBeat?.()
        })

        await this.client.login(this.config.token)
        console.log(`Discord bot logged in as ${this.client.user?.tag}`)
    }

    async stop(): Promise<void> {
        if (this.client) {
            await this.client.destroy()
            this.client = null
        }
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

    setCallbacks(callbacks: DiscordCallbacks): void {
        this.callbacks = callbacks
    }
}
