import { DiscordAdapter } from './channels/discord/bot'
import { getDiscordConfig } from './channels/discord/config'
import { tradingAgentPreset } from './core/ai/presets'
import { autoTradingAgentPreset } from './core/ai/presets/auto-trading-agent'
import { getModel, THINKING_BUDGET } from './core/ai/providers'
import { createAIRuntime } from './core/ai/runtime'
import { getAlpacaClient } from './core/broker/alpaca-client'
import { seedTradingHeartbeat } from './core/cron/service'
import { prisma } from './core/db'
import {
    getHistoryRaw,
    getInfo,
    getNews,
    getQuote,
    searchStocks,
} from './core/market-data'
import { createOrderSyncService } from './core/services/order-sync'
import { Gateway } from './gateway/gateway'
import { HealthMonitor } from './gateway/health-monitor'
import { Router } from './gateway/router'
import { createHonoApp } from './routes/index'
import { CronScheduler } from './scheduler/engine'

export type { AppType } from './routes/index'
export { createHonoApp } from './routes/index'

const DEFAULT_HEALTH_MONITOR_CONFIG = {
    checkIntervalMs: 60_000,
    gracePeriodMs: 120_000,
    checkTimeoutMs: 20_000,
    failureThreshold: 3,
    maxRecoveriesPerHour: 3,
    minRecoverIntervalMs: 300_000,
}

async function main() {
    const port = Number(process.env.PORT) || 3001

    let discord: DiscordAdapter | null = null
    let scheduler: CronScheduler
    const discordConfig = getDiscordConfig()
    const hasDiscordConfig = Boolean(discordConfig)

    // 1. Create AI runtime instances (2 runtimes only)
    const model = getModel('main')
    const defaults = { thinkingBudget: THINKING_BUDGET }

    const tradingRuntime = await createAIRuntime({
        model,
        plugins: tradingAgentPreset(),
        defaults,
    })
    const autoTradingRuntime = await createAIRuntime({
        model,
        plugins: autoTradingAgentPreset({
            alpacaClient: getAlpacaClient(),
            db: prisma,
            toolDeps: {
                getQuote,
                getInfo,
                getHistoryRaw,
                getNews,
                searchStocks,
            },
        }),
        defaults,
    })

    // 1.5 Order sync service (WebSocket — real-time order status to DB + Discord)
    const orderSync = createOrderSyncService({
        db: prisma as unknown as Parameters<
            typeof createOrderSyncService
        >[0]['db'],
    })
    orderSync.start()

    // 2. Router + Gateway
    const router = new Router({
        runtimes: {
            'trading-agent': tradingRuntime,
            'auto-trading-agent': autoTradingRuntime,
        },
    })

    // 3. Discord bot (optional) — needs Gateway, but Gateway needs channels Map
    // Build channels Map first, then Gateway, then start Discord
    const channels = new Map()

    // Create Gateway with channels map (discord adapter added below)
    const gateway = new Gateway({ router, channels })

    if (hasDiscordConfig && discordConfig) {
        discord = new DiscordAdapter(discordConfig, gateway)
        channels.set('discord', discord)
        try {
            await discord.start()
        } catch (error) {
            console.error(
                'Discord bot failed to start (continuing without it):',
                error,
            )
            channels.delete('discord')
            discord = null
        }
    } else {
        console.log('Discord bot disabled (no DISCORD_BOT_TOKEN)')
    }

    // 4. Cron scheduler
    try {
        await seedTradingHeartbeat()
    } catch (error) {
        console.error('Failed to seed cron jobs:', error)
    }

    scheduler = new CronScheduler({ gateway, prisma })
    await scheduler.start()

    // 5. Health monitor
    const healthMonitor = new HealthMonitor(DEFAULT_HEALTH_MONITOR_CONFIG)

    if (hasDiscordConfig && discordConfig) {
        healthMonitor.register('discord', {
            check: async () => {
                if (!discord) {
                    return {
                        status: 'unhealthy',
                        reason: 'client_not_ready',
                        details:
                            'discord adapter is configured but not initialized',
                        checkedAt: new Date().toISOString(),
                    }
                }
                return discord.checkHealth()
            },
            recover: async () => {
                if (!discord) {
                    discord = new DiscordAdapter(discordConfig, gateway)
                    channels.set('discord', discord)
                }
                await discord.recoverHealth()
            },
        })
    }

    healthMonitor.register('scheduler', {
        check: () => scheduler.checkHealth(),
        recover: () => scheduler.recoverHealth(),
    })

    // 6. HTTP API
    const app = createHonoApp({
        getHealthStatus: () => healthMonitor.getHealthStatus(),
        cron: { scheduler },
        gateway,
    })
    Bun.serve({ fetch: app.fetch, port, idleTimeout: 255 })
    console.log(`Flux API server running on http://localhost:${port}`)

    // 7. Start health monitoring
    healthMonitor.start()

    // 8. Graceful shutdown
    const shutdown = async () => {
        console.log('Shutting down...')
        healthMonitor.stop()
        orderSync.stop()
        await scheduler.stop()
        if (discord) await discord.stop()
        await Promise.allSettled([
            tradingRuntime.dispose(),
            autoTradingRuntime.dispose(),
        ])
        process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
    process.on('unhandledRejection', (error) => {
        console.error('Unhandled rejection:', error)
    })
}

main().catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
})
