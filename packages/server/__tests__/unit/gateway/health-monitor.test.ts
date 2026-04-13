import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { HealthMonitor, type HealthMonitorConfig, type RegisteredSubsystem, type SubsystemCheckResult } from '@/gateway/health-monitor'

const REAL_DATE_NOW = Date.now

const BASE_CONFIG: HealthMonitorConfig = {
    checkIntervalMs: 60_000,
    gracePeriodMs: 0,
    checkTimeoutMs: 20,
    failureThreshold: 3,
    maxRecoveriesPerHour: 3,
    minRecoverIntervalMs: 0,
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void

    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })

    return { promise, resolve, reject }
}

function createMonitor(overrides: Partial<HealthMonitorConfig> = {}) {
    return new HealthMonitor({ ...BASE_CONFIG, ...overrides })
}

function healthyResult(): SubsystemCheckResult {
    return {
        status: 'healthy',
        checkedAt: new Date().toISOString(),
    }
}

function unhealthyResult(reason = 'engine_stopped', details = 'subsystem is unhealthy'): SubsystemCheckResult {
    return {
        status: 'unhealthy',
        reason,
        details,
        checkedAt: new Date().toISOString(),
    }
}

function createSubsystem(overrides: Partial<RegisteredSubsystem> = {}): RegisteredSubsystem {
    return {
        check: overrides.check ?? mock(() => Promise.resolve(healthyResult())),
        recover: overrides.recover ?? mock(() => Promise.resolve()),
    }
}

async function runChecks(monitor: HealthMonitor) {
    await (monitor as any).runChecks()
}

describe('HealthMonitor', () => {
    beforeEach(() => {
        Date.now = REAL_DATE_NOW
    })

    afterEach(() => {
        Date.now = REAL_DATE_NOW
    })

    test('starts healthy with no subsystem failures', () => {
        const monitor = createMonitor()

        const status = monitor.getHealthStatus()

        expect(status.monitorStatus).toBe('healthy')
        expect(status.healthy).toBe(true)
        expect(status.subsystems).toEqual({})
    })

    test('registered subsystem is exposed in health status', () => {
        const monitor = createMonitor()
        monitor.register('discord', createSubsystem())

        const status = monitor.getHealthStatus()

        expect(status.subsystems.discord.status).toBe('healthy')
    })

    test('triggers recovery after 3 consecutive unhealthy checks', async () => {
        let now = 1_000_000
        Date.now = () => now

        const recover = mock(() => Promise.resolve())
        const monitor = createMonitor()
        monitor.register('discord', createSubsystem({
            check: mock(() => Promise.resolve(unhealthyResult())),
            recover,
        }))

        await runChecks(monitor)
        await runChecks(monitor)
        expect(recover).not.toHaveBeenCalled()

        await runChecks(monitor)

        expect(recover).toHaveBeenCalledTimes(1)
        expect(monitor.getHealthStatus().subsystems.discord.status).toBe('recovering')
    })

    test('timeout counts as a failure toward the threshold', async () => {
        let now = 2_000_000
        Date.now = () => now

        const recover = mock(() => Promise.resolve())
        const slowCheck = mock(() => new Promise<SubsystemCheckResult>((resolve) => {
            setTimeout(() => resolve(healthyResult()), 10)
        }))

        const monitor = createMonitor({ checkTimeoutMs: 1 })
        monitor.register('scheduler', createSubsystem({ check: slowCheck, recover }))

        await runChecks(monitor)
        await runChecks(monitor)
        await runChecks(monitor)

        expect(recover).toHaveBeenCalledTimes(1)
        expect(monitor.getHealthStatus().subsystems.scheduler.status).toBe('recovering')
    })

    test('grace period suppresses recovery until it expires', async () => {
        let now = 3_000_000
        Date.now = () => now

        const recover = mock(() => Promise.resolve())
        const monitor = createMonitor({ gracePeriodMs: 1_000 })
        monitor.register('discord', createSubsystem({
            check: mock(() => Promise.resolve(unhealthyResult())),
            recover,
        }))

        await runChecks(monitor)
        await runChecks(monitor)
        await runChecks(monitor)

        expect(recover).not.toHaveBeenCalled()
        expect(monitor.getHealthStatus().subsystems.discord.status).toBe('unhealthy')

        now += 1_500
        await runChecks(monitor)

        expect(recover).toHaveBeenCalledTimes(1)
        expect(monitor.getHealthStatus().subsystems.discord.status).toBe('recovering')
    })

    test('failed checks are exposed as unhealthy before recovery threshold is reached', async () => {
        const monitor = createMonitor()
        monitor.register('discord', createSubsystem({
            check: mock(() => Promise.resolve(unhealthyResult('gateway_disconnected'))),
            recover: mock(() => Promise.resolve()),
        }))

        await runChecks(monitor)

        const status = monitor.getHealthStatus()
        expect(status.subsystems.discord.status).toBe('unhealthy')
        expect(status.subsystems.discord.reason).toBe('gateway_disconnected')
    })

    test('recovering blocks duplicate recoveries while recovery is still running', async () => {
        let now = 4_000_000
        Date.now = () => now

        const deferred = createDeferred<void>()
        const recover = mock(() => deferred.promise)
        const monitor = createMonitor({ minRecoverIntervalMs: 0 })
        monitor.register('discord', createSubsystem({
            check: mock(() => Promise.resolve(unhealthyResult())),
            recover,
        }))

        await runChecks(monitor)
        await runChecks(monitor)
        await runChecks(monitor)

        expect(recover).toHaveBeenCalledTimes(1)
        expect(monitor.getHealthStatus().subsystems.discord.status).toBe('recovering')

        now += 1
        await runChecks(monitor)
        expect(recover).toHaveBeenCalledTimes(1)

        deferred.resolve()
        await deferred.promise
    })

    test('rate limit stops recovery after 3 attempts in an hour', async () => {
        let now = 5_000_000
        Date.now = () => now

        const recover = mock(() => Promise.resolve())
        const monitor = createMonitor({ minRecoverIntervalMs: 0 })
        monitor.register('scheduler', createSubsystem({
            check: mock(() => Promise.resolve(unhealthyResult())),
            recover,
        }))

        await runChecks(monitor)
        await runChecks(monitor)
        await runChecks(monitor)
        await runChecks(monitor)
        await runChecks(monitor)
        await runChecks(monitor)

        expect(recover).toHaveBeenCalledTimes(3)
        expect(monitor.getHealthStatus().subsystems.scheduler.status).toBe('unhealthy')
    })

    test('minimum recovery interval blocks back-to-back recovery attempts', async () => {
        let now = 6_000_000
        Date.now = () => now

        const recover = mock(() => Promise.resolve())
        const monitor = createMonitor({ minRecoverIntervalMs: 5 * 60 * 1000 })
        monitor.register('scheduler', createSubsystem({
            check: mock(() => Promise.resolve(unhealthyResult())),
            recover,
        }))

        await runChecks(monitor)
        await runChecks(monitor)
        await runChecks(monitor)

        expect(recover).toHaveBeenCalledTimes(1)

        now += 1
        await runChecks(monitor)
        expect(recover).toHaveBeenCalledTimes(1)
    })

    test('monitorStatus flips to unhealthy when the monitor records an internal error', () => {
        const monitor = createMonitor()
        monitor.register('discord', createSubsystem())

        ;(monitor as any).setMonitorError(new Error('boom'))

        const status = monitor.getHealthStatus()

        expect(status.monitorStatus).toBe('unhealthy')
        expect(status.healthy).toBe(false)
        expect(status.subsystems.discord.status).toBe('healthy')
    })
})
