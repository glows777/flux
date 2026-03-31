import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import brief from './brief'
import { createChatRoutes } from './chat'
import { createCronRoutes } from './cron'
import dashboard from './dashboard'
import { createHealthRoute } from './health'
import macro from './macro'
import memory from './memory'
import sessions from './sessions'
import stocks from './stocks'
import watchlist from './watchlist'
import type { CronScheduler } from '@/scheduler/engine'
import type { GatewayRouter } from '@/gateway/router'

export function createHonoApp(deps?: {
    getHealthStatus?: () => { healthy: boolean; uptime: number; subsystems: Record<string, unknown> }
    cron?: { scheduler?: CronScheduler }
    gateway?: GatewayRouter
}) {
    const health = createHealthRoute(deps)
    const cronRoute = createCronRoutes(deps?.cron)
    const chatRoute = deps?.gateway
        ? createChatRoutes(deps.gateway)
        : createChatRoutes(undefined as unknown as GatewayRouter)
    return new Hono()
        .basePath('/api')
        .use('/*', cors({
            origin: process.env.WEB_ORIGINS?.split(',') || ['http://localhost:3000'],
            credentials: true,
            allowHeaders: ['Content-Type', 'Authorization'],
            allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            exposeHeaders: ['Content-Type', 'X-Request-Id'],
        }))
        .onError((err, c) => {
            if (
                err instanceof SyntaxError ||
                (err instanceof HTTPException && err.message.includes('Malformed JSON'))
            ) {
                return c.json({ success: false, error: 'Invalid JSON body' }, 400)
            }
            return c.json({ success: false, error: 'Internal server error' }, 500)
        })
        .get('/hello', (c) => c.json({ message: 'Hello from Hono!' }))
        .route('/macro', macro)
        .route('/brief', brief)
        .route('/dashboard', dashboard)
        .route('/watchlist', watchlist)
        .route('/stocks', stocks)
        .route('/sessions', sessions)
        .route('/chat', chatRoute)
        .route('/memory', memory)
        .route('/health', health)
        .route('/cron', cronRoute)
}

const app = createHonoApp()
export default app
export type AppType = typeof app
