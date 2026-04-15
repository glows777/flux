export type MonitorStatus = 'healthy' | 'unhealthy'
export type SubsystemStatus = 'healthy' | 'unhealthy' | 'recovering'
export type SubsystemName = 'discord' | 'scheduler'

export interface SubsystemCheckResult {
    readonly status: 'healthy' | 'unhealthy'
    readonly reason?: string
    readonly details?: string
    readonly checkedAt: string
}

export interface RegisteredSubsystem {
    readonly check: () => Promise<SubsystemCheckResult>
    readonly recover: () => Promise<void>
}

export interface HealthMonitorConfig {
    readonly checkIntervalMs: number
    readonly gracePeriodMs: number
    readonly checkTimeoutMs: number
    readonly failureThreshold: number
    readonly maxRecoveriesPerHour: number
    readonly minRecoverIntervalMs: number
}

export interface HealthStatus {
    readonly monitorStatus: MonitorStatus
    readonly healthy: boolean
    readonly subsystems: Record<
        string,
        {
            readonly status: SubsystemStatus
            readonly reason?: string
            readonly details?: string
            readonly checkedAt?: string
        }
    >
}

export const DEFAULT_HEALTH_MONITOR_CONFIG = {
    checkIntervalMs: 60_000,
    gracePeriodMs: 120_000,
    checkTimeoutMs: 20_000,
    failureThreshold: 3,
    maxRecoveriesPerHour: 3,
    minRecoverIntervalMs: 300_000,
} satisfies HealthMonitorConfig

interface InternalSubsystemState {
    readonly subsystem: RegisteredSubsystem
    status: SubsystemStatus
    lastResult: SubsystemCheckResult | null
    failureCount: number
    recoveryInFlight: boolean
    recoveryHistory: number[]
}

class CheckTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Health check timed out after ${timeoutMs}ms`)
        this.name = 'CheckTimeoutError'
    }
}

function formatErrorDetails(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    return 'unknown error'
}

export class HealthMonitor {
    private readonly subsystems = new Map<
        SubsystemName,
        InternalSubsystemState
    >()
    private startedAt = Date.now()
    private monitorStatus: MonitorStatus = 'healthy'
    private checkInterval: ReturnType<typeof setInterval> | null = null

    constructor(
        private readonly config: HealthMonitorConfig = DEFAULT_HEALTH_MONITOR_CONFIG,
    ) {}

    register(name: SubsystemName, subsystem: RegisteredSubsystem): void {
        const existing = this.subsystems.get(name)

        this.subsystems.set(name, {
            subsystem,
            status: 'healthy',
            lastResult: null,
            failureCount: 0,
            recoveryInFlight: false,
            recoveryHistory: existing?.recoveryHistory ?? [],
        })
    }

    start(): void {
        if (this.checkInterval) return

        this.startedAt = Date.now()
        this.checkInterval = setInterval(() => {
            void this.runChecks()
        }, this.config.checkIntervalMs)
    }

    stop(): void {
        if (!this.checkInterval) return

        clearInterval(this.checkInterval)
        this.checkInterval = null
    }

    getHealthStatus(): HealthStatus {
        const subsystems: HealthStatus['subsystems'] = {}

        for (const [name, state] of this.subsystems.entries()) {
            const snapshot: {
                status: SubsystemStatus
                reason?: string
                details?: string
                checkedAt?: string
            } = {
                status: state.status,
            }

            if (state.lastResult) {
                snapshot.checkedAt = state.lastResult.checkedAt

                if (state.status !== 'healthy') {
                    snapshot.reason = state.lastResult.reason
                    snapshot.details = state.lastResult.details
                }
            }

            subsystems[name] = snapshot
        }

        const healthy =
            this.monitorStatus === 'healthy' &&
            Object.values(subsystems).every(
                (subsystem) => subsystem.status === 'healthy',
            )

        return {
            monitorStatus: this.monitorStatus,
            healthy,
            subsystems,
        }
    }

    private async runChecks(): Promise<void> {
        try {
            const now = Date.now()
            await Promise.all(
                [...this.subsystems.entries()].map(([name, state]) =>
                    this.runCheck(name, state, now),
                ),
            )
        } catch (error) {
            this.setMonitorError(error)
        }
    }

    private async runCheck(
        name: SubsystemName,
        state: InternalSubsystemState,
        now: number,
    ): Promise<void> {
        const result = await this.runCheckWithTimeout(state.subsystem.check)
        state.lastResult = result

        if (result.status === 'healthy') {
            state.failureCount = 0
            state.status = 'healthy'
            return
        }

        state.failureCount += 1
        state.status = 'unhealthy'

        if (now - this.startedAt < this.config.gracePeriodMs) {
            return
        }

        if (state.failureCount < this.config.failureThreshold) {
            return
        }

        if (state.recoveryInFlight) {
            state.status = 'recovering'
            return
        }

        if (!this.canRecover(now, state)) {
            state.status = 'unhealthy'
            return
        }

        void this.maybeRecover(name, state)
    }

    private async runCheckWithTimeout(
        check: () => Promise<SubsystemCheckResult>,
    ): Promise<SubsystemCheckResult> {
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null

        const checkPromise = Promise.resolve().then(() => check())
        checkPromise.catch(() => undefined)

        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new CheckTimeoutError(this.config.checkTimeoutMs))
            }, this.config.checkTimeoutMs)
        })

        try {
            return await Promise.race([checkPromise, timeoutPromise])
        } catch (error) {
            const details = formatErrorDetails(error)
            if (error instanceof CheckTimeoutError) {
                return {
                    status: 'unhealthy',
                    reason: 'check_timeout',
                    details,
                    checkedAt: new Date().toISOString(),
                }
            }

            return {
                status: 'unhealthy',
                reason: 'check_failed',
                details,
                checkedAt: new Date().toISOString(),
            }
        } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle)
        }
    }

    private canRecover(now: number, state: InternalSubsystemState): boolean {
        if (this.config.maxRecoveriesPerHour <= 0) return false

        const recentHistory = state.recoveryHistory.filter(
            (timestamp) => now - timestamp < 60 * 60 * 1000,
        )
        state.recoveryHistory = recentHistory

        if (recentHistory.length >= this.config.maxRecoveriesPerHour)
            return false

        const lastRecoveryAt = recentHistory.at(-1)
        if (
            lastRecoveryAt !== undefined &&
            now - lastRecoveryAt < this.config.minRecoverIntervalMs
        ) {
            return false
        }

        return true
    }

    private async maybeRecover(
        name: SubsystemName,
        state: InternalSubsystemState,
    ): Promise<void> {
        const now = Date.now()

        try {
            state.status = 'recovering'
            state.recoveryInFlight = true
            this.recordRecovery(state, now)
            await state.subsystem.recover()
        } catch (error) {
            console.error(`Recovery failed for ${name}:`, error)
        } finally {
            state.recoveryInFlight = false
        }
    }

    private recordRecovery(
        state: InternalSubsystemState,
        timestamp: number,
    ): void {
        state.recoveryHistory = [...state.recoveryHistory, timestamp]
    }

    private setMonitorError(error: unknown): void {
        this.monitorStatus = 'unhealthy'
        console.error('HealthMonitor internal error:', error)
    }
}
