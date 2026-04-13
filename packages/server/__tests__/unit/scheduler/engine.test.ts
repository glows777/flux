import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { CronScheduler, parseSchedule } from '@/scheduler/engine'

const baseJob = {
    id: 'job-1',
    name: 'test',
    schedule: 'every:2m',
    taskType: 'trading-agent',
    taskPayload: { prompt: 'test' },
    channel: 'web',
    channelTarget: null,
    userId: 'user-1',
    enabled: true,
    retryCount: 0,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
}

function createScheduler(options?: {
    jobs?: any[]
    gatewayChat?: any
}) {
    const mockFindMany = mock(() => Promise.resolve(options?.jobs ?? []))
    const mockUpdate = mock(() => Promise.resolve({ id: 'job-1', retryCount: 0, enabled: true }))
    const mockFindUnique = mock(() => Promise.resolve(baseJob))
    const mockRunCreate = mock(() => Promise.resolve({ id: 'run-1' }))

    const scheduler = new CronScheduler({
        gateway: {
            chat: options?.gatewayChat ?? mock(() => Promise.resolve({ success: true, text: 'done' })),
        } as any,
        prisma: {
            cronJob: {
                findMany: mockFindMany,
                update: mockUpdate,
                findUnique: mockFindUnique,
            },
            cronJobRun: { create: mockRunCreate },
        } as any,
    })

    return {
        scheduler,
        mocks: {
            mockFindMany,
            mockUpdate,
            mockFindUnique,
            mockRunCreate,
        },
    }
}

describe('parseSchedule', () => {
    test('converts every:5m to cron expression', () => {
        expect(parseSchedule('every:5m')).toBe('0 */5 * * * *')
    })

    test('returns null for invalid expression', () => {
        expect(parseSchedule('invalid')).toBeNull()
    })
})

describe('CronScheduler.start', () => {
    test('loads enabled jobs from DB and marks the scheduler started', async () => {
        const { scheduler, mocks } = createScheduler()

        await scheduler.start()

        const internal = scheduler as any
        expect(mocks.mockFindMany).toHaveBeenCalledTimes(1)
        expect(internal.isStarted).toBe(true)
        expect(typeof internal.startedAt).toBe('number')
        expect(typeof internal.lastEngineActivityAt).toBe('number')

        await scheduler.stop()
    })
})

describe('CronScheduler.checkHealth', () => {
    test('reports unhealthy before start', async () => {
        const { scheduler } = createScheduler()

        const result = await scheduler.checkHealth()

        expect(result.status).toBe('unhealthy')
        expect(result.reason).toBe('scheduler_not_started')
    })

    test('reports unhealthy when no active cron jobs are loaded', async () => {
        const { scheduler } = createScheduler()

        await scheduler.start()
        const result = await scheduler.checkHealth()

        expect(result.status).toBe('unhealthy')
        expect(result.reason).toBe('no_active_jobs')

        await scheduler.stop()
    })

    test('reports healthy after start when cron jobs are running', async () => {
        const { scheduler } = createScheduler({
            jobs: [baseJob],
        })

        await scheduler.start()
        const result = await scheduler.checkHealth()

        expect(result.status).toBe('healthy')
        expect(result.checkedAt).toBeTruthy()

        await scheduler.stop()
    })

    test('reports engine_stopped when an active cron is no longer running', async () => {
        const { scheduler } = createScheduler({
            jobs: [baseJob],
        })

        await scheduler.start()
        const internal = scheduler as any
        const cron = internal.jobs.get('job-1')
        cron.stop()

        const result = await scheduler.checkHealth()

        expect(result.status).toBe('unhealthy')
        expect(result.reason).toBe('engine_stopped')

        await scheduler.stop()
    })

    test('reports job_stuck when a running job exceeds the internal threshold', async () => {
        const { scheduler } = createScheduler({
            jobs: [baseJob],
        })

        await scheduler.start()
        const internal = scheduler as any
        const startedAt = Date.now() - 26 * 60 * 1000
        internal.running.add('job-1')
        internal.runningJobStartedAt.set('job-1', startedAt)
        internal.oldestRunningJobStartedAt = startedAt

        const result = await scheduler.checkHealth()

        expect(result.status).toBe('unhealthy')
        expect(result.reason).toBe('job_stuck')
        expect(result.details).toContain('job-1')

        await scheduler.stop()
    })
})

describe('CronScheduler.recoverHealth', () => {
    test('restarts the scheduler by calling stop then start', async () => {
        const { scheduler } = createScheduler()
        const stopMock = mock(() => Promise.resolve())
        const startMock = mock(() => Promise.resolve())

        ;(scheduler as any).stop = stopMock
        ;(scheduler as any).start = startMock

        await scheduler.recoverHealth()

        expect(stopMock).toHaveBeenCalledTimes(1)
        expect(startMock).toHaveBeenCalledTimes(1)
    })
})

describe('CronScheduler.handleResult via runNow', () => {
    const mockCronJobUpdate = mock(() => Promise.resolve({
        id: 'job-1', retryCount: 0, enabled: true,
    }))
    const mockCronJobRunCreate = mock(() => Promise.resolve({ id: 'run-1' }))
    const mockCronJobFindUnique = mock(() => Promise.resolve(baseJob))

    let scheduler: CronScheduler

    beforeEach(() => {
        mockCronJobUpdate.mockReset()
        mockCronJobRunCreate.mockReset()
        mockCronJobFindUnique.mockReset()

        mockCronJobUpdate.mockImplementation(() => Promise.resolve({
            id: 'job-1', retryCount: 0, enabled: true,
        }))
        mockCronJobRunCreate.mockImplementation(() => Promise.resolve({ id: 'run-1' }))
        mockCronJobFindUnique.mockImplementation(() => Promise.resolve(baseJob))

        scheduler = new CronScheduler({
            gateway: {
                chat: mock(() => Promise.resolve({ success: true, text: 'done' })),
            } as any,
            prisma: {
                cronJob: {
                    findMany: mock(() => Promise.resolve([])),
                    update: mockCronJobUpdate,
                    findUnique: mockCronJobFindUnique,
                },
                cronJobRun: { create: mockCronJobRunCreate },
            } as any,
        })
    })

    test('writes a success run record after runNow and updates runtime state', async () => {
        await scheduler.runNow('job-1')

        expect(mockCronJobRunCreate).toHaveBeenCalledTimes(1)
        const call = mockCronJobRunCreate.mock.calls[0][0]
        expect(call.data.jobId).toBe('job-1')
        expect(call.data.status).toBe('success')
        expect(call.data.triggeredBy).toBe('manual')
        expect(typeof call.data.durationMs).toBe('number')

        const internal = scheduler as any
        expect(typeof internal.lastEngineActivityAt).toBe('number')
        expect(typeof internal.lastSuccessfulRunAt).toBe('number')
        expect(internal.running.has('job-1')).toBe(false)
        expect(internal.oldestRunningJobStartedAt).toBeNull()
    })

    test('writes an error run record on failure', async () => {
        const failScheduler = new CronScheduler({
            gateway: {
                chat: mock(() => Promise.resolve({ success: false, text: '' })),
            } as any,
            prisma: {
                cronJob: {
                    findMany: mock(() => Promise.resolve([])),
                    update: mockCronJobUpdate,
                    findUnique: mockCronJobFindUnique,
                },
                cronJobRun: { create: mockCronJobRunCreate },
            } as any,
        })

        await failScheduler.runNow('job-1')

        expect(mockCronJobRunCreate).toHaveBeenCalledTimes(1)
        const call = mockCronJobRunCreate.mock.calls[0][0]
        expect(call.data.status).toBe('error')
        expect(call.data.triggeredBy).toBe('manual')
    })
})
