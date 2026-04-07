import { createHonoApp } from './routes/index'
import { Router } from './gateway/router'
import { Gateway } from './gateway/gateway'
import { HeartbeatMonitor } from './gateway/heartbeat'
import { DiscordAdapter } from './channels/discord/bot'
import { getDiscordConfig } from './channels/discord/config'
import { CronScheduler } from './scheduler/engine'
import { seedTradingHeartbeat } from './core/cron/service'
import { prisma } from './core/db'
import { createAIRuntime } from './core/ai/runtime'
import { tradingAgentPreset } from './core/ai/presets'
import { autoTradingAgentPreset } from './core/ai/presets/auto-trading-agent'
import { getModel, THINKING_BUDGET } from './core/ai/providers'
import { getAlpacaClient } from './core/broker/alpaca-client'
import { getReportFromCache } from './core/ai/cache'
import { getQuote, getInfo, getHistoryRaw, getNews, searchStocks } from './core/market-data'
import { createOrderSyncService } from './core/services/order-sync'

export type { AppType } from './routes/index'
export { createHonoApp } from './routes/index'

const DEFAULT_RULES = {
    discord: { graceMs: 60_000, staleMs: 90_000, stuckMs: 25 * 60_000, maxRestartsPerHour: 10, minRestartIntervalMs: 30_000, exempt: false },
    scheduler: { graceMs: 60_000, staleMs: 90_000, stuckMs: 25 * 60_000, maxRestartsPerHour: 10, minRestartIntervalMs: 30_000, exempt: false },
    database: { graceMs: 10_000, staleMs: 120_000, stuckMs: 0, maxRestartsPerHour: 0, minRestartIntervalMs: 0, exempt: false },
}

async function main() {
    const port = Number(process.env.PORT) || 3001

    // Forward declarations for recovery callbacks
    let discord: DiscordAdapter | null = null
    let scheduler: CronScheduler

    // 1. Heartbeat monitor
    const heartbeat = new HeartbeatMonitor({
        checkEveryMs: 15_000,
        rules: DEFAULT_RULES,
        onRecovery: async (subsystem) => {
            if (subsystem === 'discord' && discord) {
                await discord.stop()
                await discord.start()
            }
            if (subsystem === 'scheduler') {
                await scheduler.stop()
                await scheduler.start()
            }
        },
    })

    // 2. Create AI runtime instances (2 runtimes only)
    const model = getModel('main')
    const defaults = { thinkingBudget: THINKING_BUDGET }

    const tradingRuntime = await createAIRuntime({ model, plugins: tradingAgentPreset(), defaults })
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
                getReportFromCache,
                searchStocks,
            },
        }),
        defaults,
    })

    // 2.5 Order sync service (WebSocket — real-time order status to DB + Discord)
    const orderSync = createOrderSyncService({
        db: prisma as unknown as Parameters<typeof createOrderSyncService>[0]['db'],
    })
    orderSync.start()

    // 3. Router + Gateway
    const router = new Router({
        runtimes: {
            'trading-agent': tradingRuntime,
            'auto-trading-agent': autoTradingRuntime,
        },
    })

    // 4. Discord bot (optional) — needs Gateway, but Gateway needs channels Map
    // Build channels Map first, then Gateway, then start Discord
    const channels = new Map()
    const discordConfig = getDiscordConfig()

    // Create Gateway with channels map (discord adapter added below)
    const gateway = new Gateway({ router, channels })

    if (discordConfig) {
        discord = new DiscordAdapter(discordConfig, gateway)
        channels.set('discord', discord)
        try {
            await discord.start()
            discord.setCallbacks({
                onBeat: () => heartbeat.beat('discord'),
                onProgress: () => heartbeat.progress('discord'),
            })
        } catch (error) {
            console.error('Discord bot failed to start (continuing without it):', error)
            channels.delete('discord')
            discord = null
        }
    } else {
        console.log('Discord bot disabled (no DISCORD_BOT_TOKEN)')
    }

    // 5. Cron scheduler
    try {
        await seedTradingHeartbeat()
    } catch (error) {
        console.error('Failed to seed cron jobs:', error)
    }

    scheduler = new CronScheduler({ gateway, prisma })
    await scheduler.start()
    scheduler.onBeat(() => heartbeat.beat('scheduler'))
    scheduler.onProgress(() => heartbeat.progress('scheduler'))

    // 6. HTTP API
    const app = createHonoApp({
        getHealthStatus: () => heartbeat.getHealthStatus(),
        cron: { scheduler },
        gateway,
    })
    Bun.serve({ fetch: app.fetch, port, idleTimeout: 255 })
    console.log(`Flux API server running on http://localhost:${port}`)

    // 7. Start heartbeat monitoring
    heartbeat.start()

    // 8. Database heartbeat ping (SELECT 1 every 60s)
    const dbPingInterval = setInterval(async () => {
        try {
            await prisma.$queryRaw`SELECT 1`
            heartbeat.beat('database')
            heartbeat.progress('database')
        } catch (error) {
            console.error('Database ping failed:', error)
        }
    }, 60_000)
    // Initial beat
    heartbeat.beat('database')
    heartbeat.progress('database')

    // 9. Graceful shutdown
    const shutdown = async () => {
        console.log('Shutting down...')
        clearInterval(dbPingInterval)
        heartbeat.stop()
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
