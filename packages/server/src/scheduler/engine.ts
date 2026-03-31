import { Cron } from 'croner'
import type { CronJob } from '@prisma/client'
import type { ChannelAdapter } from '@/channels/types'
import type { GatewayRouter } from '@/gateway/router'
import { TaskExecutor, type ExecutionResult } from './executor'
import { NotificationDedup } from './dedup'

const MAX_RETRIES = 5

interface CronSchedulerDeps {
    readonly channels: Map<string, ChannelAdapter>
    readonly gateway: GatewayRouter
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
    private dedup = new NotificationDedup()
    private beatCallback: (() => void) | null = null
    private progressCallback: (() => void) | null = null
    private beatInterval: Timer | null = null

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
        if (this.beatInterval) {
            clearInterval(this.beatInterval)
            this.beatInterval = null
        }
        for (const [, cron] of this.jobs) {
            cron.stop()
        }
        this.jobs.clear()
    }

    async addJob(job: CronJob): Promise<void> {
        this.scheduleJob(job)
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

        this.running.add(jobId)
        try {
            const result = await this.executor.execute(job)
            await this.handleResult(jobId, result)
            try { if (result.success) this.progressCallback?.() } catch { /* non-fatal */ }
        } finally {
            this.running.delete(jobId)
        }
    }

    onBeat(callback: () => void): void {
        this.beatCallback = callback
    }

    onProgress(callback: () => void): void {
        this.progressCallback = callback
    }

    parseSchedule(schedule: string): string | null {
        if (schedule.startsWith('every:')) {
            const match = schedule.slice(6).match(/^(\d+)(s|m|h)$/)
            if (!match) return null

            const [, value, unit] = match
            const num = +value
            if (num <= 0) return null

            switch (unit) {
                case 's': return num <= 59 ? `*/${num} * * * * *` : null
                case 'm': return num <= 59 ? `0 */${num} * * * *` : null
                case 'h': return num <= 23 ? `0 0 */${num} * * *` : null
                default: return null
            }
        }

        try {
            new Cron(schedule, { timezone: 'Asia/Shanghai' })
            return schedule
        } catch {
            return null
        }
    }

    private scheduleJob(job: CronJob): void {
        const schedule = this.parseSchedule(job.schedule)
        if (!schedule) {
            console.error(`Invalid schedule for job ${job.id}: ${job.schedule}`)
            return
        }

        const cron = new Cron(schedule, { timezone: 'Asia/Shanghai' }, async () => {
            this.beatCallback?.()

            if (this.running.has(job.id)) {
                console.log(`Job ${job.id} still running, skipping`)
                return
            }

            this.running.add(job.id)
            try {
                const result = await this.executor.execute(job)
                await this.handleResult(job.id, result)
                try { if (result.success) this.progressCallback?.() } catch { /* non-fatal */ }
            } finally {
                this.running.delete(job.id)
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
                console.error(`Job ${jobId} disabled after ${MAX_RETRIES} consecutive failures`)
            }
        }

        // Push notification to channel (with dedup)
        const freshJob = await this.deps.prisma.cronJob.findUnique({ where: { id: jobId } })
        if (freshJob) await this.notifyResult(freshJob, result)
    }

    private async notifyResult(job: CronJob, result: ExecutionResult): Promise<void> {
        if (!job.channelTarget || !result.output) return

        if (this.dedup.isDuplicate(job.id, result.output)) return

        const target = job.channelTarget as { type: string; channelId: string }
        const adapter = this.deps.channels.get(target.type)
        if (!adapter) return

        try {
            await adapter.send(
                { channelId: target.channelId },
                { content: result.output },
            )
        } catch (error) {
            console.error(`Failed to notify for job ${job.id}:`, error)
        }
    }
}
