import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { CronJob } from '@prisma/client'
import { CronScheduler, parseSchedule } from '@/scheduler/engine'

type SchedulerDeps = ConstructorParameters<typeof CronScheduler>[0]
type SchedulerGateway = SchedulerDeps['gateway']
type SchedulerPrisma = SchedulerDeps['prisma']
type TestableCronScheduler = CronScheduler & {
    readonly isStarted: boolean
    readonly startedAt: number | null
    readonly lastEngineActivityAt: number | null
    readonly lastSuccessfulRunAt: number | null
    readonly jobs: Map<string, { stop(): void }>
    readonly running: Set<string>
    readonly runningJobStartedAt: Map<string, number>
    oldestRunningJobStartedAt: number | null
    stop: () => Promise<void>
    start: () => Promise<void>
}

function asTestableScheduler(scheduler: CronScheduler): TestableCronScheduler {
    return scheduler as unknown as TestableCronScheduler
}

function createGateway(
    gatewayChat: ReturnType<typeof mock> = mock(() =>
        Promise.resolve({ success: true, text: 'done' }),
    ),
): SchedulerGateway {
    return {
        chat: gatewayChat,
    } as unknown as SchedulerGateway
}

function createPrisma(
    overrides: Partial<SchedulerPrisma> = {},
): SchedulerPrisma {
    return {
        cronJob: {
            findMany: mock(() => Promise.resolve([])),
            update: mock(() =>
                Promise.resolve({ id: 'job-1', retryCount: 0, enabled: true }),
            ),
            findFirst: mock(() => Promise.resolve(baseJob)),
            count: mock(() => Promise.resolve(0)),
            ...overrides.cronJob,
        },
        cronJobRun: {
            create: mock(() => Promise.resolve({ id: 'run-1' })),
            ...overrides.cronJobRun,
        },
    } as SchedulerPrisma
}

const baseJob: CronJob = {
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
    jobs?: CronJob[]
    gatewayChat?: ReturnType<typeof mock>
    enabledCount?: number
}) {
    const mockFindMany = mock(() => Promise.resolve(options?.jobs ?? []))
    const mockUpdate = mock(() =>
        Promise.resolve({ id: 'job-1', retryCount: 0, enabled: true }),
    )
    const mockFindFirst = mock(() => Promise.resolve(baseJob))
    const mockRunCreate = mock(() => Promise.resolve({ id: 'run-1' }))
    const mockCount = mock(() => Promise.resolve(options?.enabledCount ?? 0))

    const scheduler = new CronScheduler({
        gateway: createGateway(options?.gatewayChat),
        prisma: createPrisma({
            cronJob: {
                findMany: mockFindMany,
                update: mockUpdate,
                findFirst: mockFindFirst,
                count: mockCount,
            },
            cronJobRun: { create: mockRunCreate },
        }),
    })

    return {
        scheduler,
        mocks: {
            mockFindMany,
            mockUpdate,
            mockFindFirst,
            mockRunCreate,
            mockCount,
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

        const internal = asTestableScheduler(scheduler)
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

    test('reports unhealthy when enabled jobs exist in DB but none are loaded', async () => {
        const { scheduler } = createScheduler({ enabledCount: 1 })

        await scheduler.start()
        const result = await scheduler.checkHealth()

        expect(result.status).toBe('unhealthy')
        expect(result.reason).toBe('no_active_jobs')

        await scheduler.stop()
    })

    test('reports healthy when no enabled jobs are configured (all deleted or none created)', async () => {
        const { scheduler } = createScheduler({ enabledCount: 0 })

        await scheduler.start()
        const result = await scheduler.checkHealth()

        expect(result.status).toBe('healthy')
        expect(result.details).toContain('no enabled jobs')

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
        const internal = asTestableScheduler(scheduler)
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
        const internal = asTestableScheduler(scheduler)
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

        const testableScheduler = asTestableScheduler(scheduler)
        testableScheduler.stop = stopMock
        testableScheduler.start = startMock

        await scheduler.recoverHealth()

        expect(stopMock).toHaveBeenCalledTimes(1)
        expect(startMock).toHaveBeenCalledTimes(1)
    })
})

describe('CronScheduler.handleResult via runNow', () => {
    const mockCronJobUpdate = mock(() =>
        Promise.resolve({
            id: 'job-1',
            retryCount: 0,
            enabled: true,
        }),
    )
    const mockCronJobRunCreate = mock(() => Promise.resolve({ id: 'run-1' }))
    const mockCronJobFindFirst = mock(() => Promise.resolve(baseJob))
    const mockCronJobCount = mock(() => Promise.resolve(0))

    let scheduler: CronScheduler

    beforeEach(() => {
        mockCronJobUpdate.mockReset()
        mockCronJobRunCreate.mockReset()
        mockCronJobFindFirst.mockReset()
        mockCronJobCount.mockReset()

        mockCronJobUpdate.mockImplementation(() =>
            Promise.resolve({
                id: 'job-1',
                retryCount: 0,
                enabled: true,
            }),
        )
        mockCronJobRunCreate.mockImplementation(() =>
            Promise.resolve({ id: 'run-1' }),
        )
        mockCronJobFindFirst.mockImplementation(() => Promise.resolve(baseJob))
        mockCronJobCount.mockImplementation(() => Promise.resolve(0))

        scheduler = new CronScheduler({
            gateway: createGateway(
                mock(() => Promise.resolve({ success: true, text: 'done' })),
            ),
            prisma: createPrisma({
                cronJob: {
                    findMany: mock(() => Promise.resolve([])),
                    update: mockCronJobUpdate,
                    findFirst: mockCronJobFindFirst,
                    count: mockCronJobCount,
                },
                cronJobRun: { create: mockCronJobRunCreate },
            }),
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

        const internal = asTestableScheduler(scheduler)
        expect(typeof internal.lastEngineActivityAt).toBe('number')
        expect(typeof internal.lastSuccessfulRunAt).toBe('number')
        expect(internal.running.has('job-1')).toBe(false)
        expect(internal.oldestRunningJobStartedAt).toBeNull()
    })

    test('writes an error run record on failure', async () => {
        const failScheduler = new CronScheduler({
            gateway: createGateway(
                mock(() => Promise.resolve({ success: false, text: '' })),
            ),
            prisma: createPrisma({
                cronJob: {
                    findMany: mock(() => Promise.resolve([])),
                    update: mockCronJobUpdate,
                    findFirst: mockCronJobFindFirst,
                    count: mockCronJobCount,
                },
                cronJobRun: { create: mockCronJobRunCreate },
            }),
        })

        await failScheduler.runNow('job-1')

        expect(mockCronJobRunCreate).toHaveBeenCalledTimes(1)
        const call = mockCronJobRunCreate.mock.calls[0][0]
        expect(call.data.status).toBe('error')
        expect(call.data.triggeredBy).toBe('manual')
    })

    test('soft-deletes job and removes from scheduler after MAX_RETRIES failures', async () => {
        const jobAtMaxRetries = { ...baseJob, retryCount: 4 } // next failure = 5 = MAX_RETRIES

        mockCronJobFindFirst.mockImplementation(() =>
            Promise.resolve(jobAtMaxRetries),
        )

        const failScheduler = new CronScheduler({
            gateway: createGateway(
                mock(() => Promise.resolve({ success: false, text: 'err' })),
            ),
            prisma: createPrisma({
                cronJob: {
                    findMany: mock(() => Promise.resolve([jobAtMaxRetries])),
                    update: mockCronJobUpdate,
                    findFirst: mockCronJobFindFirst,
                    count: mockCronJobCount,
                },
                cronJobRun: { create: mockCronJobRunCreate },
            }),
        })

        await failScheduler.start()
        await failScheduler.runNow('job-1')

        const updateCall = mockCronJobUpdate.mock.calls.find(
            (call) => call[0].data?.deletedAt !== undefined,
        )
        expect(updateCall).toBeDefined()
        expect(updateCall[0].data.enabled).toBe(false)
        expect(updateCall[0].data.deletedAt).toBeInstanceOf(Date)

        const internal = asTestableScheduler(failScheduler)
        expect(internal.jobs.has('job-1')).toBe(false)

        await failScheduler.stop()
    })
})
