export interface SubsystemRule {
    readonly graceMs: number
    readonly staleMs: number
    readonly stuckMs: number
    readonly maxRestartsPerHour: number
    readonly minRestartIntervalMs: number
    readonly exempt: boolean
}

export interface SubsystemStatus {
    readonly status: 'up' | 'down' | 'reconnecting' | 'stalled' | 'stuck' | 'disabled'
    readonly lastHeartbeat: string | null
    readonly details?: string
}

export interface HealthStatus {
    readonly healthy: boolean
    readonly uptime: number
    readonly subsystems: Record<string, SubsystemStatus>
}

interface HeartbeatConfig {
    readonly checkEveryMs: number
    readonly rules: Record<string, SubsystemRule>
    readonly onRecovery: (subsystem: string) => Promise<void>
}

interface HeartbeatEntry {
    registeredAt: number
    lastBeat: number
    lastProgress: number | null
    status: SubsystemStatus['status']
}

export class HeartbeatMonitor {
    private entries = new Map<string, HeartbeatEntry>()
    private restartHistory = new Map<string, number[]>()
    private checkInterval: Timer | null = null

    constructor(private readonly config: HeartbeatConfig) {}

    beat(subsystem: string): void {
        const existing = this.entries.get(subsystem)
        if (existing) {
            this.entries.set(subsystem, { ...existing, lastBeat: Date.now() })
        } else {
            this.entries.set(subsystem, {
                registeredAt: Date.now(),
                lastBeat: Date.now(),
                lastProgress: null,
                status: 'up',
            })
        }
    }

    progress(subsystem: string): void {
        const existing = this.entries.get(subsystem)
        if (existing) {
            this.entries.set(subsystem, { ...existing, lastProgress: Date.now() })
        }
    }

    getHealthStatus(): HealthStatus {
        const subsystems: Record<string, SubsystemStatus> = {
            api: { status: 'up', lastHeartbeat: new Date().toISOString() },
        }

        for (const [name, entry] of this.entries) {
            subsystems[name] = {
                status: entry.status,
                lastHeartbeat: new Date(entry.lastBeat).toISOString(),
            }
        }

        const healthy = Object.values(subsystems).every(
            (s) => s.status === 'up' || s.status === 'disabled',
        )

        return { healthy, uptime: process.uptime(), subsystems }
    }

    start(): void {
        this.checkInterval = setInterval(() => this.check(), this.config.checkEveryMs)
    }

    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval)
            this.checkInterval = null
        }
    }

    private async check(): Promise<void> {
        const now = Date.now()

        for (const [name, entry] of this.entries) {
            const rule = this.config.rules[name]
            if (!rule) continue

            // Node 1: disabled
            if (entry.status === 'disabled') continue

            // Node 2: grace period
            if (now - entry.registeredAt < rule.graceMs) continue

            // Node 3: exempt
            if (rule.exempt) continue

            // Node 4: maxRestartsPerHour = 0 (no restart subsystems like database)
            if (rule.maxRestartsPerHour === 0) {
                if (now - entry.lastBeat > rule.staleMs) {
                    this.entries.set(name, { ...entry, status: 'down' })
                }
                continue
            }

            // Pre-compute stale/stuck for node 5 edge case
            const isStale = now - entry.lastBeat > rule.staleMs
            const isStuck = rule.stuckMs > 0
                && entry.lastProgress !== null
                && now - entry.lastProgress > rule.stuckMs

            // Node 5: rate limit check
            if (!this.canRestart(name, rule)) {
                if (isStale || isStuck || entry.status === 'stalled' || entry.status === 'stuck') {
                    this.entries.set(name, { ...entry, status: 'down' })
                }
                continue
            }

            // Node 6: stale detection
            if (isStale) {
                this.entries.set(name, { ...entry, status: 'stalled' })
                await this.attemptRestart(name)
                continue
            }

            // Node 7: stuck detection
            if (isStuck) {
                this.entries.set(name, { ...entry, status: 'stuck' })
                await this.attemptRestart(name)
                continue
            }

            // Node 8: healthy
            if (entry.status !== 'up') {
                this.entries.set(name, { ...entry, status: 'up' })
            }
        }
    }

    private canRestart(subsystem: string, rule: SubsystemRule): boolean {
        if (rule.maxRestartsPerHour === 0) return false

        const now = Date.now()
        const oneHourAgo = now - 60 * 60 * 1000
        const history = this.restartHistory.get(subsystem) ?? []

        const recent = history.filter(ts => ts > oneHourAgo)
        this.restartHistory.set(subsystem, recent)

        if (recent.length >= rule.maxRestartsPerHour) return false

        const lastRestart = recent.at(-1)
        if (lastRestart && now - lastRestart < rule.minRestartIntervalMs) return false

        return true
    }

    private async attemptRestart(subsystem: string): Promise<void> {
        try {
            await this.config.onRecovery(subsystem)
        } catch (error) {
            console.error(`Recovery failed for ${subsystem}:`, error)
        }

        const history = this.restartHistory.get(subsystem) ?? []
        this.restartHistory.set(subsystem, [...history, Date.now()])
    }
}
