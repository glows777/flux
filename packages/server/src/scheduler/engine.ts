import { Cron } from 'croner'
import type { CronJob } from '@prisma/client'
import type { Gateway } from '@/gateway/gateway'
import { TaskExecutor, type ExecutionResult } from './executor'

const MAX_RETRIES = 5
const MIN_INTERVAL_S = 60

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
            findUnique: (args: any) => Promise<any>
        }
    }
}

export class CronScheduler {
    private jobs = new Map<string, Cron>()
    private running = new Set<string>()
    private executor: TaskExecutor
    private beatCallback: (() => void) | null = null
    private progressCallback: (() => void) | null = null
    private beatInterval: Timer | null = null
    private generation = 0

    constructor(private readonly deps: CronSchedulerDeps) {
        this.executor = new TaskExecutor({ gateway: deps.gateway })
    }

    async start(): Promise<void> {
        const jobs = await this.deps.prisma.cronJob.findMany({ where: { enabled: true } })
        for (const job of jobs) {
            this.scheduleJob(job)
        }
        // Independent beat timer — emits heartbeat even when no jobs are due
        this.beatInterval = setInterval(() => this.beatCallback?.(), 30_000)
        console.log(`Cron scheduler started with ${jobs.length} jobs`)
    }

    async stop(): Promise<void> {
        this.generation++
        if (this.beatInterval) {
            clearInterval(this.beatInterval)
            this.beatInterval = null
        }
        for (const [, cron] of this.jobs) {
            cron.stop()
        }
        this.jobs.clear()
        this.running.clear()
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
        }
    }

    async runNow(jobId: string): Promise<void> {
        const job = await this.deps.prisma.cronJob.findUnique({ where: { id: jobId } })
        if (!job) throw new Error(`Job ${jobId} not found`)

        if (this.running.has(jobId)) throw new Error(`Job ${jobId} is already running`)

        const gen = this.generation
        this.running.add(jobId)
        try {
            const result = await this.executor.execute(job)
            if (gen !== this.generation) return
            await this.handleResult(jobId, result)
            try { if (result.success) this.progressCallback?.() } catch { /* non-fatal */ }
        } finally {
            if (gen === this.generation) this.running.delete(jobId)
        }
    }

    onBeat(callback: () => void): void {
        this.beatCallback = callback
    }

    onProgress(callback: () => void): void {
        this.progressCallback = callback
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
            this.beatCallback?.()

            if (this.running.has(job.id)) {
                console.log(`Job ${job.id} still running, skipping`)
                return
            }

            this.running.add(job.id)
            try {
                const result = await this.executor.execute(job)
                if (gen !== this.generation) return // stale execution after restart
                await this.handleResult(job.id, result)
                try { if (result.success) this.progressCallback?.() } catch { /* non-fatal */ }
            } finally {
                if (gen === this.generation) this.running.delete(job.id)
            }
        })

        this.jobs.set(job.id, cron)
    }

    private async handleResult(jobId: string, result: ExecutionResult): Promise<void> {
        if (result.success) {
            await this.deps.prisma.cronJob.update({
                where: { id: jobId },
                data: {
                    lastRunAt: new Date(),
                    lastRunStatus: 'success',
                    lastRunError: null,
                    retryCount: 0,
                },
            })
        } else {
            const job = await this.deps.prisma.cronJob.findUnique({ where: { id: jobId } })
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
                    enabled: shouldDisable ? false : undefined,
                },
            })

            if (shouldDisable) {
                await this.removeJob(jobId)
                console.error(`Job ${jobId} disabled after ${MAX_RETRIES} consecutive failures`)
            }
        }
    }
}
