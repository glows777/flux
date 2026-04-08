import { Hono } from 'hono'
import { z } from 'zod'
import { sValidator } from '@hono/standard-validator'
import {
    createCronJob,
    deleteCronJob,
    getCronJob,
    listCronJobs,
    listCronJobRuns,
    listAllRuns,
    updateCronJob,
} from '@/core/cron/service'
import { type CronScheduler, parseSchedule } from '@/scheduler/engine'

const createSchema = z.object({
    name: z.string().min(1).max(100),
    schedule: z.string().min(1),
    taskType: z.string().min(1),
    taskPayload: z.object({ prompt: z.string().min(1) }),
    channelTarget: z.object({
        type: z.string(),
        channelId: z.string(),
    }).optional(),
})

const updateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    schedule: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    taskPayload: z.object({ prompt: z.string().min(1) }).optional(),
    channelTarget: z.object({
        type: z.string(),
        channelId: z.string(),
    }).optional(),
})

const runsQuerySchema = z.object({
    page: z.string().optional().transform(v => v ? parseInt(v, 10) : 1),
    limit: z.string().optional().transform(v => v ? parseInt(v, 10) : 20),
    jobId: z.string().optional(),
    status: z.string().optional(),
})

interface CronRouteDeps {
    scheduler?: CronScheduler
}

export function createCronRoutes(deps: CronRouteDeps = {}) {
    return new Hono()
        .get('/', async (c) => {
            try {
                const jobs = await listCronJobs()
                const data = jobs.map((job) => ({
                    ...job,
                    nextRunAt: deps.scheduler?.getNextRunAt(job.id) ?? null,
                }))
                return c.json({ success: true, data })
            } catch (error) {
                return c.json({ success: false, error: 'Failed to list cron jobs' }, 500)
            }
        })
        .get('/runs', sValidator('query', runsQuerySchema), async (c) => {
            try {
                const { page, limit, jobId, status } = c.req.valid('query')
                const result = await listAllRuns({ jobId, status }, { page, limit })
                return c.json({ success: true, data: result.runs, total: result.total })
            } catch (error) {
                return c.json({ success: false, error: 'Failed to list runs' }, 500)
            }
        })
        .get('/:id/runs', sValidator('query', runsQuerySchema), async (c) => {
            try {
                const id = c.req.param('id')
                const { page, limit } = c.req.valid('query')
                const result = await listCronJobRuns(id, { page, limit })
                return c.json({ success: true, data: result.runs, total: result.total })
            } catch (error) {
                return c.json({ success: false, error: 'Failed to list job runs' }, 500)
            }
        })
        .post('/', sValidator('json', createSchema), async (c) => {
            try {
                const body = c.req.valid('json')
                if (!parseSchedule(body.schedule)) {
                    return c.json({ success: false, error: 'Invalid or too frequent schedule (minimum interval: 60s)' }, 400)
                }
                const job = await createCronJob({
                    ...body,
                    channel: 'web',
                    userId: 'default',
                })
                if (deps.scheduler) await deps.scheduler.addJob(job)
                return c.json({ success: true, data: job })
            } catch (error) {
                return c.json({ success: false, error: 'Failed to create cron job' }, 500)
            }
        })
        .put('/:id', sValidator('json', updateSchema), async (c) => {
            try {
                const id = c.req.param('id')
                const body = c.req.valid('json')
                if (body.schedule && !parseSchedule(body.schedule)) {
                    return c.json({ success: false, error: 'Invalid or too frequent schedule (minimum interval: 60s)' }, 400)
                }
                const job = await updateCronJob(id, body)
                if (deps.scheduler) {
                    await deps.scheduler.removeJob(id)
                    if (job.enabled) await deps.scheduler.addJob(job)
                }
                return c.json({ success: true, data: job })
            } catch (error) {
                return c.json({ success: false, error: 'Failed to update cron job' }, 500)
            }
        })
        .delete('/:id', async (c) => {
            try {
                const id = c.req.param('id')
                if (deps.scheduler) await deps.scheduler.removeJob(id)
                await deleteCronJob(id)
                return c.json({ success: true })
            } catch (error) {
                return c.json({ success: false, error: 'Failed to delete cron job' }, 500)
            }
        })
        .post('/:id/run', async (c) => {
            try {
                const id = c.req.param('id')
                const job = await getCronJob(id)
                if (!job) {
                    return c.json({ success: false, error: 'Job not found' }, 404)
                }
                if (!deps.scheduler) {
                    return c.json({ success: false, error: 'Scheduler not available' }, 503)
                }
                await deps.scheduler.runNow(id)
                return c.json({ success: true, data: { triggered: true } })
            } catch (error) {
                return c.json({ success: false, error: 'Failed to trigger cron job' }, 500)
            }
        })
}
