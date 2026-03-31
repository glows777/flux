import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { HeartbeatMonitor } from '@/gateway/heartbeat'
import type { SubsystemRule } from '@/gateway/heartbeat'

const RULES: Record<string, SubsystemRule> = {
    discord: { graceMs: 100, staleMs: 200, stuckMs: 500, maxRestartsPerHour: 3, minRestartIntervalMs: 50, exempt: false },
    scheduler: { graceMs: 100, staleMs: 200, stuckMs: 500, maxRestartsPerHour: 3, minRestartIntervalMs: 50, exempt: false },
    database: { graceMs: 50, staleMs: 300, stuckMs: 0, maxRestartsPerHour: 0, minRestartIntervalMs: 0, exempt: false },
}

describe('HeartbeatMonitor', () => {
    let onRecovery: ReturnType<typeof mock>
    let monitor: HeartbeatMonitor

    beforeEach(() => {
        onRecovery = mock(() => Promise.resolve())
        monitor = new HeartbeatMonitor({
            checkEveryMs: 50,
            rules: RULES,
            onRecovery,
        })
    })

    test('getHealthStatus returns api as always up', () => {
        const status = monitor.getHealthStatus()
        expect(status.healthy).toBe(true)
        expect(status.subsystems.api.status).toBe('up')
    })

    test('registered subsystem shows up after beat()', () => {
        monitor.beat('discord')
        const status = monitor.getHealthStatus()
        expect(status.subsystems.discord.status).toBe('up')
    })

    test('node 2: grace period — skip during graceMs', async () => {
        monitor.beat('discord')
        // Immediately check — within graceMs (100ms)
        await (monitor as any).check()
        expect(onRecovery).not.toHaveBeenCalled()
    })

    test('node 4: maxRestartsPerHour=0 — database goes directly to down on stale', async () => {
        monitor.beat('database')
        // Wait past grace (50ms) + stale (300ms)
        await new Promise(r => setTimeout(r, 400))
        await (monitor as any).check()
        const status = monitor.getHealthStatus()
        expect(status.subsystems.database.status).toBe('down')
        expect(onRecovery).not.toHaveBeenCalled()
    })

    test('node 6: stale detection triggers onRecovery', async () => {
        monitor.beat('discord')
        // Wait past grace (100ms) + stale (200ms)
        await new Promise(r => setTimeout(r, 350))
        await (monitor as any).check()
        expect(onRecovery).toHaveBeenCalledWith('discord')
    })

    test('node 7: stuck detection — beat without progress', async () => {
        monitor.beat('discord')
        monitor.progress('discord') // initial progress
        // Wait past grace (100ms)
        await new Promise(r => setTimeout(r, 150))
        // Keep beating but stop calling progress()
        monitor.beat('discord')
        // Wait past stuckMs (500ms) from initial progress
        await new Promise(r => setTimeout(r, 550))
        monitor.beat('discord') // still alive, updates lastBeat
        await (monitor as any).check()
        const status = monitor.getHealthStatus()
        expect(status.subsystems.discord.status).toBe('stuck')
    })

    test('healthy is false when any subsystem is down', () => {
        monitor.beat('discord')
        // Force status to down via internal state
        const entry = (monitor as any).entries.get('discord')
        ;(monitor as any).entries.set('discord', { ...entry, status: 'down' })
        const status = monitor.getHealthStatus()
        expect(status.healthy).toBe(false)
    })
})
