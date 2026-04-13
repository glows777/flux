import { beforeEach, describe, expect, it, mock } from 'bun:test'
import './setup'
import { createHonoApp } from '@/routes/index'

const mockGetHealthStatus = mock(() => ({
    monitorStatus: 'healthy' as const,
    healthy: true,
    subsystems: {
        discord: { status: 'healthy' as const },
        scheduler: { status: 'healthy' as const },
    },
}))

const appWithHealthStatus = createHonoApp({
    getHealthStatus: mockGetHealthStatus,
})

const defaultApp = createHonoApp()

describe('GET /api/health', () => {
    beforeEach(() => {
        mockGetHealthStatus.mockReset()
        mockGetHealthStatus.mockImplementation(() => ({
            monitorStatus: 'healthy',
            healthy: true,
            subsystems: {
                discord: { status: 'healthy' },
                scheduler: { status: 'healthy' },
            },
        }))
    })

    it('returns 200 and the monitor payload when everything is healthy', async () => {
        const res = await appWithHealthStatus.request('/api/health')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json).toEqual({
            monitorStatus: 'healthy',
            healthy: true,
            subsystems: {
                discord: { status: 'healthy' },
                scheduler: { status: 'healthy' },
            },
        })
    })

    it('returns 503 when any subsystem is unhealthy', async () => {
        mockGetHealthStatus.mockImplementation(() => ({
            monitorStatus: 'healthy',
            healthy: false,
            subsystems: {
                discord: {
                    status: 'unhealthy',
                    reason: 'gateway_disconnected',
                    details: 'discord gateway disconnected',
                    checkedAt: '2026-04-13T12:00:00.000Z',
                },
                scheduler: { status: 'healthy' },
            },
        }))

        const res = await appWithHealthStatus.request('/api/health')
        const json = await res.json()

        expect(res.status).toBe(503)
        expect(json.healthy).toBe(false)
        expect(json.subsystems.discord.status).toBe('unhealthy')
        expect(json.subsystems.discord.reason).toBe('gateway_disconnected')
    })

    it('returns 503 when monitorStatus is unhealthy even if subsystem data is healthy', async () => {
        mockGetHealthStatus.mockImplementation(() => ({
            monitorStatus: 'unhealthy',
            healthy: true,
            subsystems: {
                discord: { status: 'healthy' },
                scheduler: { status: 'healthy' },
            },
        }))

        const res = await appWithHealthStatus.request('/api/health')
        const json = await res.json()

        expect(res.status).toBe(503)
        expect(json.monitorStatus).toBe('unhealthy')
        expect(json.healthy).toBe(true)
    })

    it('returns a valid default payload without injected health status', async () => {
        const res = await defaultApp.request('/api/health')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json).toEqual({
            monitorStatus: 'healthy',
            healthy: true,
            subsystems: {
                api: { status: 'healthy' },
            },
        })
    })
})
