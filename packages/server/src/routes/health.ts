import { Hono } from 'hono'
import type { HealthStatus } from '@/gateway/health-monitor'

export type { HealthStatus } from '@/gateway/health-monitor'

interface HealthDeps {
    getHealthStatus?: () => HealthStatus
}

export function createHealthRoute(deps: HealthDeps = {}) {
    return new Hono().get('/', (c) => {
        const status = deps.getHealthStatus?.() ?? {
            monitorStatus: 'healthy' as const,
            healthy: true,
            subsystems: { api: { status: 'healthy' as const } },
        }

        return c.json(
            status,
            status.healthy && status.monitorStatus === 'healthy' ? 200 : 503,
        )
    })
}
