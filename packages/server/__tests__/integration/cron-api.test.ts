import { beforeEach, describe, expect, it, mock } from 'bun:test'
import './setup'
import {
    mockCreateCronJob,
    mockListCronJobs,
    mockUpdateCronJob,
    mockDeleteCronJob,
    mockGetCronJob,
} from './helpers/mock-boundaries'

import { Hono } from 'hono'
import { createCronRoutes } from '@/routes/cron'

// ─── App without scheduler (default) ───

const app = new Hono().basePath('/api').route('/cron', createCronRoutes())

// ─── App with mock scheduler ───

const mockScheduler = {
    addJob: mock(() => Promise.resolve()),
    removeJob: mock(() => Promise.resolve()),
    runNow: mock(() => Promise.resolve()),
}
const appWithScheduler = new Hono()
    .basePath('/api')
    .route('/cron', createCronRoutes({ scheduler: mockScheduler as any }))

// ─── Helpers ───

function resetMocks() {
    mockCreateCronJob.mockReset()
    mockListCronJobs.mockReset()
    mockUpdateCronJob.mockReset()
    mockDeleteCronJob.mockReset()
    mockGetCronJob.mockReset()
    mockScheduler.addJob.mockReset()
    mockScheduler.removeJob.mockReset()
    mockScheduler.runNow.mockReset()

    mockCreateCronJob.mockImplementation(() =>
        Promise.resolve({ id: 'cron-1', name: 'test', enabled: true }),
    )
    mockListCronJobs.mockImplementation(() => Promise.resolve([]))
    mockUpdateCronJob.mockImplementation(() =>
        Promise.resolve({ id: 'cron-1', enabled: true }),
    )
    mockDeleteCronJob.mockImplementation(() => Promise.resolve({ id: 'cron-1' }))
    mockGetCronJob.mockImplementation(() => Promise.resolve(null))
}

const validBody = {
    name: 'Morning check',
    schedule: 'every:30m',
    taskType: 'ai-prompt',
    taskPayload: { prompt: 'Check NVDA price' },
}

// ==================== Tests ====================

describe('Cron API', () => {
    beforeEach(resetMocks)

    // ─── GET /api/cron ───

    describe('GET /api/cron', () => {
        it('returns 200 with empty list', async () => {
            const res = await app.request('/api/cron')
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.success).toBe(true)
            expect(json.data).toEqual([])
        })

        it('returns 200 with jobs', async () => {
            mockListCronJobs.mockImplementation(() =>
                Promise.resolve([
                    { id: 'cron-1', name: 'Job A', schedule: 'every:5m', enabled: true },
                    { id: 'cron-2', name: 'Job B', schedule: 'every:1h', enabled: false },
                ]),
            )

            const res = await app.request('/api/cron')
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.data).toHaveLength(2)
        })

        it('returns 500 on service error', async () => {
            mockListCronJobs.mockImplementation(() =>
                Promise.reject(new Error('DB down')),
            )

            const res = await app.request('/api/cron')
            const json = await res.json()

            expect(res.status).toBe(500)
            expect(json.success).toBe(false)
        })
    })

    // ─── POST /api/cron ───

    describe('POST /api/cron', () => {
        it('creates a job and returns 200', async () => {
            const res = await app.request('/api/cron', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validBody),
            })
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.success).toBe(true)
            expect(json.data.id).toBe('cron-1')
            expect(mockCreateCronJob).toHaveBeenCalledTimes(1)
        })

        it('passes channel=web and userId=default', async () => {
            await app.request('/api/cron', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validBody),
            })

            expect(mockCreateCronJob).toHaveBeenCalledWith(
                expect.objectContaining({
                    channel: 'web',
                    userId: 'default',
                    name: 'Morning check',
                }),
            )
        })

        it('adds job to scheduler when available', async () => {
            const res = await appWithScheduler.request('/api/cron', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validBody),
            })

            expect(res.status).toBe(200)
            expect(mockScheduler.addJob).toHaveBeenCalledTimes(1)
        })

        it('returns 500 on service error', async () => {
            mockCreateCronJob.mockImplementation(() =>
                Promise.reject(new Error('DB write failed')),
            )

            const res = await app.request('/api/cron', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validBody),
            })
            const json = await res.json()

            expect(res.status).toBe(500)
            expect(json.success).toBe(false)
        })
    })

    // ─── PUT /api/cron/:id ───

    describe('PUT /api/cron/:id', () => {
        it('updates a job and returns 200', async () => {
            const res = await app.request('/api/cron/cron-1', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false }),
            })
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.success).toBe(true)
            expect(mockUpdateCronJob).toHaveBeenCalledWith('cron-1', { enabled: false })
        })

        it('re-schedules job via scheduler when enabled', async () => {
            mockUpdateCronJob.mockImplementation(() =>
                Promise.resolve({ id: 'cron-1', enabled: true }),
            )

            await appWithScheduler.request('/api/cron/cron-1', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schedule: 'every:10m' }),
            })

            expect(mockScheduler.removeJob).toHaveBeenCalledWith('cron-1')
            expect(mockScheduler.addJob).toHaveBeenCalledTimes(1)
        })

        it('only removes from scheduler when disabled', async () => {
            mockUpdateCronJob.mockImplementation(() =>
                Promise.resolve({ id: 'cron-1', enabled: false }),
            )

            await appWithScheduler.request('/api/cron/cron-1', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false }),
            })

            expect(mockScheduler.removeJob).toHaveBeenCalledWith('cron-1')
            expect(mockScheduler.addJob).not.toHaveBeenCalled()
        })

        it('returns 500 on service error', async () => {
            mockUpdateCronJob.mockImplementation(() =>
                Promise.reject(new Error('not found')),
            )

            const res = await app.request('/api/cron/cron-1', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false }),
            })

            expect(res.status).toBe(500)
        })
    })

    // ─── DELETE /api/cron/:id ───

    describe('DELETE /api/cron/:id', () => {
        it('deletes a job and returns 200', async () => {
            const res = await app.request('/api/cron/cron-1', {
                method: 'DELETE',
            })
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.success).toBe(true)
            expect(mockDeleteCronJob).toHaveBeenCalledWith('cron-1')
        })

        it('removes from scheduler when available', async () => {
            await appWithScheduler.request('/api/cron/cron-1', {
                method: 'DELETE',
            })

            expect(mockScheduler.removeJob).toHaveBeenCalledWith('cron-1')
        })

        it('returns 500 on service error', async () => {
            mockDeleteCronJob.mockImplementation(() =>
                Promise.reject(new Error('DB error')),
            )

            const res = await app.request('/api/cron/cron-1', {
                method: 'DELETE',
            })

            expect(res.status).toBe(500)
        })
    })

    // ─── POST /api/cron/:id/run ───

    describe('POST /api/cron/:id/run', () => {
        it('returns 503 when no scheduler', async () => {
            mockGetCronJob.mockImplementation(() =>
                Promise.resolve({ id: 'cron-1', name: 'test' }),
            )

            const res = await app.request('/api/cron/cron-1/run', {
                method: 'POST',
            })
            const json = await res.json()

            expect(res.status).toBe(503)
            expect(json.error).toContain('Scheduler not available')
        })

        it('returns 404 when job not found', async () => {
            mockGetCronJob.mockImplementation(() => Promise.resolve(null))

            const res = await appWithScheduler.request('/api/cron/cron-1/run', {
                method: 'POST',
            })
            const json = await res.json()

            expect(res.status).toBe(404)
            expect(json.error).toContain('not found')
        })

        it('triggers job and returns 200', async () => {
            mockGetCronJob.mockImplementation(() =>
                Promise.resolve({ id: 'cron-1', name: 'test' }),
            )

            const res = await appWithScheduler.request('/api/cron/cron-1/run', {
                method: 'POST',
            })
            const json = await res.json()

            expect(res.status).toBe(200)
            expect(json.success).toBe(true)
            expect(json.data.triggered).toBe(true)
            expect(mockScheduler.runNow).toHaveBeenCalledWith('cron-1')
        })

        it('returns 500 when scheduler.runNow throws', async () => {
            mockGetCronJob.mockImplementation(() =>
                Promise.resolve({ id: 'cron-1', name: 'test' }),
            )
            mockScheduler.runNow.mockImplementation(() =>
                Promise.reject(new Error('already running')),
            )

            const res = await appWithScheduler.request('/api/cron/cron-1/run', {
                method: 'POST',
            })

            expect(res.status).toBe(500)
        })
    })
})
