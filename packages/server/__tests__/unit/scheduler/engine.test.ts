import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { CronScheduler, parseSchedule } from '@/scheduler/engine'

describe('parseSchedule', () => {
    test('converts every:5m to cron expression', () => {
        expect(parseSchedule('every:5m')).toBe('0 */5 * * * *')
    })

    test('returns null for invalid expression', () => {
        expect(parseSchedule('invalid')).toBeNull()
    })
})

describe('CronScheduler.start', () => {
    test('loads enabled jobs from DB', async () => {
        const mockFindMany = mock(() => Promise.resolve([]))
        const scheduler = new CronScheduler({
            gateway: {} as any,
            prisma: {
                cronJob: { findMany: mockFindMany, update: mock(), findUnique: mock() },
                cronJobRun: { create: mock(() => Promise.resolve({ id: 'run-1' })) },
            } as any,
        })
        await scheduler.start()
        expect(mockFindMany).toHaveBeenCalledTimes(1)
        await scheduler.stop()
    })
})

describe('CronScheduler.handleResult via runNow', () => {
    const mockCronJobUpdate = mock(() => Promise.resolve({
        id: 'job-1', retryCount: 0, enabled: true,
    }))
    const mockCronJobRunCreate = mock(() => Promise.resolve({ id: 'run-1' }))
    const mockCronJobFindUnique = mock(() => Promise.resolve({
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
    }))

    let scheduler: CronScheduler

    beforeEach(() => {
        mockCronJobUpdate.mockReset()
        mockCronJobRunCreate.mockReset()
        mockCronJobFindUnique.mockReset()

        mockCronJobUpdate.mockImplementation(() => Promise.resolve({
            id: 'job-1', retryCount: 0, enabled: true,
        }))
        mockCronJobRunCreate.mockImplementation(() => Promise.resolve({ id: 'run-1' }))
        mockCronJobFindUnique.mockImplementation(() => Promise.resolve({
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
        }))

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

    test('writes a success run record after runNow', async () => {
        await scheduler.runNow('job-1')

        expect(mockCronJobRunCreate).toHaveBeenCalledTimes(1)
        const call = mockCronJobRunCreate.mock.calls[0][0]
        expect(call.data.jobId).toBe('job-1')
        expect(call.data.status).toBe('success')
        expect(call.data.triggeredBy).toBe('manual')
        expect(typeof call.data.durationMs).toBe('number')
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
