import { Hono } from 'hono'
import { z } from 'zod'
import { sValidator } from '@hono/standard-validator'
import {
    createCronJob,
    deleteCronJob,
    getCronJob,
    listCronJobs,
    updateCronJob,
} from '@/core/cron/service'
import type { CronScheduler } from '@/scheduler/engine'

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

interface CronRouteDeps {
    scheduler?: CronScheduler
}

export function createCronRoutes(deps: CronRouteDeps = {}) {
    return new Hono()
        .get('/', async (c) => {
            try {
                const jobs = await listCronJobs()
                return c.json({ success: true, data: jobs })
            } catch (error) {
                return c.json({ success: false, error: 'Failed to list cron jobs' }, 500)
            }
        })
        .post('/', sValidator('json', createSchema), async (c) => {
            try {
                const body = c.req.valid('json')
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
        .put('/:id', async (c) => {
            try {
                const id = c.req.param('id')
                const body = await c.req.json()
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
