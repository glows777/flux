import { Hono } from 'hono'

interface HealthDeps {
    getHealthStatus?: () => { healthy: boolean; uptime: number; subsystems: Record<string, unknown> }
}

export function createHealthRoute(deps: HealthDeps = {}) {
    return new Hono()
        .get('/', (c) => {
            if (deps.getHealthStatus) {
                const status = deps.getHealthStatus()
                return c.json(status, status.healthy ? 200 : 503)
            }
            return c.json({
                healthy: true,
                uptime: process.uptime(),
                subsystems: { api: { status: 'up' } },
            })
        })
}
