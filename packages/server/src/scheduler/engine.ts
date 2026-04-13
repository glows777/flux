import { Cron } from 'croner'
import type { CronJob } from '@prisma/client'
import type { Gateway } from '@/gateway/gateway'
import { TaskExecutor, type ExecutionResult } from './executor'

const MAX_RETRIES = 5
const MIN_INTERVAL_S = 60
const JOB_STUCK_THRESHOLD_MS = 25 * 60 * 1000

export function parseSchedule(schedule: string): string | null {
    let expr: string

    if (schedule.startsWith('every:')) {
        const match = schedule.slice(6).match(/^(\d+)(s|m|h)$/)
        if (!match) return null

        const [, value, unit] = match
        const num = +value
        if (num <= 0) return null

        switch (unit) {
            case 's': expr = num <= 59 ? `*/${num} * * * * *` : ''; break
            case 'm': expr = num <= 59 ? `0 */${num} * * * *` : ''; break
            case 'h': expr = num <= 23 ? `0 0 */${num} * * *` : ''; break
            default: return null
        }
        if (!expr) return null
    } else {
        expr = schedule
    }

    try {
        const test = new Cron(expr, { timezone: 'Asia/Shanghai' })
        const runs = test.nextRuns(10)
        test.stop()
        for (let i = 1; i < runs.length; i++) {
            if (runs[i].getTime() - runs[i - 1].getTime() < MIN_INTERVAL_S * 1000) return null
        }
        return expr
    } catch {
        return null
    }
}

interface CronSchedulerDeps {
    readonly gateway: Gateway
    readonly prisma: {
        cronJob: {
            findMany: (args: any) => Promise<any[]>
            update: (args: any) => Promise<any>
            findFirst: (args: any) => Promise<any>
            count: (args: any) => Promise<number>
        }
        cronJobRun: {
            create: (args: any) => Promise<any>
        }
    }
}

export interface SchedulerHealthResult {
    readonly status: 'healthy' | 'unhealthy'
    readonly reason?: string
    readonly details?: string
    readonly checkedAt: string
}

export class CronScheduler {
    private jobs = new Map<string, Cron>()
    private running = new Set<string>()
    private runningJobStartedAt = new Map<string, number>()
    private executor: TaskExecutor
    private generation = 0
    private startedAt: number | null = null
    private lastEngineActivityAt: number | null = null
    private lastSuccessfulRunAt: number | null = null
    private oldestRunningJobStartedAt: number | null = null
    private isStarted = false

    constructor(private readonly deps: CronSchedulerDeps) {
        this.executor = new TaskExecutor({ gateway: deps.gateway })
    }

    async start(): Promise<void> {
        const jobs = await this.deps.prisma.cronJob.findMany({ where: { enabled: true, deletedAt: null } })
        for (const job of jobs) {
            this.scheduleJob(job)
        }
        const now = Date.now()
        this.startedAt = now
        this.lastEngineActivityAt = now
        this.isStarted = true
        console.log(`Cron scheduler started with ${jobs.length} jobs`)
    }

    async stop(): Promise<void> {
        this.generation++
        for (const [, cron] of this.jobs) {
            cron.stop()
        }
        this.jobs.clear()
        this.running.clear()
        this.runningJobStartedAt.clear()
        this.startedAt = null
        this.lastEngineActivityAt = null
        this.lastSuccessfulRunAt = null
        this.oldestRunningJobStartedAt = null
        this.isStarted = false
    }

    async addJob(job: CronJob): Promise<void> {
        this.scheduleJob(job)
    }

    getNextRunAt(jobId: string): Date | null {
        return this.jobs.get(jobId)?.nextRun() ?? null
    }

    async removeJob(jobId: string): Promise<void> {
        const cron = this.jobs.get(jobId)
        if (cron) {
            cron.stop()
            this.jobs.delete(jobId)
            this.running.delete(jobId)
            this.runningJobStartedAt.delete(jobId)
            this.recalculateOldestRunningJobStartedAt()
        }
    }

    async runNow(jobId: string): Promise<void> {
        const job = await this.deps.prisma.cronJob.findFirst({ where: { id: jobId, deletedAt: null } })
        if (!job) throw new Error(`Job ${jobId} not found`)

        if (this.running.has(jobId)) throw new Error(`Job ${jobId} is already running`)

        const gen = this.generation
        const startMs = Date.now()
        this.markEngineActivity(startMs)
        this.beginJobExecution(jobId, startMs)
        try {
            const result = await this.executor.execute(job)
            if (gen !== this.generation) return
            await this.handleResult(jobId, result, 'manual', Date.now() - startMs)
        } finally {
            if (gen === this.generation) this.finishJobExecution(jobId)
        }
    }

    async checkHealth(): Promise<SchedulerHealthResult> {
        const checkedAt = new Date().toISOString()

        if (!this.isStarted) {
            return {
                status: 'unhealthy',
                reason: 'scheduler_not_started',
                details: 'scheduler has not been started',
                checkedAt,
            }
        }

        if (this.jobs.size === 0) {
            const enabledCount = await this.deps.prisma.cronJob.count({ where: { enabled: true, deletedAt: null } })
            if (enabledCount === 0) {
                return { status: 'healthy', details: 'no enabled jobs configured', checkedAt }
            }
            return {
                status: 'unhealthy',
                reason: 'no_active_jobs',
                details: 'scheduler has no active cron jobs loaded',
                checkedAt,
            }
        }

        for (const [jobId, cron] of this.jobs) {
            if (!cron.isRunning() || cron.isStopped()) {
                return {
                    status: 'unhealthy',
                    reason: 'engine_stopped',
                    details: `cron job ${jobId} is not running`,
                    checkedAt,
                }
            }
        }

        const stuckJob = this.getStuckJob(Date.now())
        if (stuckJob) {
            return {
                status: 'unhealthy',
                reason: 'job_stuck',
                details: `job ${stuckJob.jobId} has been running for ${Math.floor(stuckJob.ageMs / 1000)} seconds`,
                checkedAt,
            }
        }

        return {
            status: 'healthy',
            details: this.getHealthDetails(),
            checkedAt,
        }
    }

    async recoverHealth(): Promise<void> {
        await this.stop()
        await this.start()
    }

    private scheduleJob(job: CronJob): void {
        const schedule = parseSchedule(job.schedule)
        if (!schedule) {
            console.error(`Invalid schedule for job ${job.id}: ${job.schedule}`)
            return
        }

        const existing = this.jobs.get(job.id)
        if (existing) existing.stop()

        const gen = this.generation
        const cron = new Cron(schedule, { timezone: 'Asia/Shanghai', interval: MIN_INTERVAL_S }, async () => {
            const startMs = Date.now()
            this.markEngineActivity(startMs)

            if (this.running.has(job.id)) {
                console.log(`Job ${job.id} still running, skipping`)
                return
            }

            this.beginJobExecution(job.id, startMs)
            try {
                const result = await this.executor.execute(job)
                if (gen !== this.generation) return // stale execution after restart
                await this.handleResult(job.id, result, 'scheduler', Date.now() - startMs)
            } catch (error) {
                console.error(`Job ${job.id} scheduler error:`, error)
            } finally {
                if (gen === this.generation) this.finishJobExecution(job.id)
            }
        })

        this.jobs.set(job.id, cron)
    }

    private async handleResult(
        jobId: string,
        result: ExecutionResult,
        triggeredBy: 'scheduler' | 'manual',
        durationMs: number,
    ): Promise<void> {
        if (result.success) {
            this.lastSuccessfulRunAt = Date.now()
            await this.deps.prisma.cronJob.update({
                where: { id: jobId },
                data: {
                    lastRunAt: new Date(),
                    lastRunStatus: 'success',
                    lastRunError: null,
                    retryCount: 0,
                },
            })
            try {
                await this.deps.prisma.cronJobRun.create({
                    data: {
                        jobId,
                        status: 'success',
                        output: result.output ?? null,
                        durationMs,
                        triggeredBy,
                    },
                })
            } catch (e) {
                console.error(`Failed to write run record for job ${jobId}:`, e)
            }
        } else {
            const job = await this.deps.prisma.cronJob.findFirst({ where: { id: jobId, deletedAt: null } })
            if (!job) return

            const newRetryCount = job.retryCount + 1
            const shouldDisable = newRetryCount >= MAX_RETRIES

            await this.deps.prisma.cronJob.update({
                where: { id: jobId },
                data: {
                    lastRunAt: new Date(),
                    lastRunStatus: 'error',
                    lastRunError: result.error,
                    retryCount: newRetryCount,
                    ...(shouldDisable ? { enabled: false, deletedAt: new Date() } : {}),
                },
            })
            try {
                await this.deps.prisma.cronJobRun.create({
                    data: {
                        jobId,
                        status: 'error',
                        output: result.output ?? null,
                        error: result.error ?? null,
                        durationMs,
                        triggeredBy,
                    },
                })
            } catch (e) {
                console.error(`Failed to write run record for job ${jobId}:`, e)
            }

            if (shouldDisable) {
                await this.removeJob(jobId)
                console.error(`Job ${jobId} disabled after ${MAX_RETRIES} consecutive failures`)
            }
        }
    }

    private markEngineActivity(timestamp = Date.now()): void {
        this.lastEngineActivityAt = timestamp
    }

    private beginJobExecution(jobId: string, startedAt = Date.now()): void {
        this.running.add(jobId)
        this.runningJobStartedAt.set(jobId, startedAt)
        this.recalculateOldestRunningJobStartedAt()
    }

    private finishJobExecution(jobId: string): void {
        this.running.delete(jobId)
        this.runningJobStartedAt.delete(jobId)
        this.recalculateOldestRunningJobStartedAt()
    }

    private recalculateOldestRunningJobStartedAt(): void {
        let oldest: number | null = null
        for (const startedAt of this.runningJobStartedAt.values()) {
            if (oldest === null || startedAt < oldest) {
                oldest = startedAt
            }
        }
        this.oldestRunningJobStartedAt = oldest
    }

    private getStuckJob(now: number): { readonly jobId: string; readonly startedAt: number; readonly ageMs: number } | null {
        let stuckJobId: string | null = null
        let stuckStartedAt: number | null = null

        for (const [jobId, startedAt] of this.runningJobStartedAt) {
            if (now - startedAt <= JOB_STUCK_THRESHOLD_MS) continue
            if (stuckStartedAt === null || startedAt < stuckStartedAt) {
                stuckJobId = jobId
                stuckStartedAt = startedAt
            }
        }

        if (!stuckJobId || stuckStartedAt === null) return null

        return {
            jobId: stuckJobId,
            startedAt: stuckStartedAt,
            ageMs: now - stuckStartedAt,
        }
    }

    private getHealthDetails(): string {
        const details: string[] = []

        details.push(`runningJobs=${this.running.size}`)
        if (this.oldestRunningJobStartedAt !== null) {
            details.push(`oldestRunningJobStartedAt=${new Date(this.oldestRunningJobStartedAt).toISOString()}`)
        }
        if (this.startedAt !== null) {
            details.push(`startedAt=${new Date(this.startedAt).toISOString()}`)
        }
        if (this.lastEngineActivityAt !== null) {
            details.push(`lastEngineActivityAt=${new Date(this.lastEngineActivityAt).toISOString()}`)
        }
        if (this.lastSuccessfulRunAt !== null) {
            details.push(`lastSuccessfulRunAt=${new Date(this.lastSuccessfulRunAt).toISOString()}`)
        }

        return details.join(', ')
    }
}
