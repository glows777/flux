import { beforeEach, describe, expect, mock, test } from 'bun:test'
import {
    createCronJob,
    deleteCronJob,
    getCronJob,
    listCronJobs,
    updateCronJob,
} from '@/core/cron/service'

describe('Cron service', () => {
    const rawMockPrisma = {
        cronJob: {
            create: mock(() => Promise.resolve({ id: 'job-1', name: 'test' })),
            findMany: mock(() => Promise.resolve([{ id: 'job-1' }])),
            update: mock(() =>
                Promise.resolve({ id: 'job-1', enabled: false }),
            ),
            findUnique: mock(() => Promise.resolve({ id: 'job-1' })),
            findFirst: mock(() => Promise.resolve({ id: 'job-1' })),
        },
        cronJobRun: {
            create: mock(() => Promise.resolve({ id: 'run-1' })),
            findMany: mock(() => Promise.resolve([])),
            count: mock(() => Promise.resolve(0)),
        },
    }
    const mockPrisma = rawMockPrisma as unknown as NonNullable<
        Parameters<typeof createCronJob>[1]
    >

    beforeEach(() => {
        rawMockPrisma.cronJob.create.mockClear()
        rawMockPrisma.cronJob.findMany.mockClear()
        rawMockPrisma.cronJob.update.mockClear()
        rawMockPrisma.cronJob.findUnique.mockClear()
        rawMockPrisma.cronJob.findFirst.mockClear()
    })

    test('createCronJob calls prisma.create with correct data', async () => {
        const data = {
            name: 'Morning check',
            schedule: 'every:1h',
            taskType: 'ai-prompt',
            taskPayload: { prompt: 'Check NVDA' },
            channel: 'discord',
            userId: 'user-1',
        }
        await createCronJob(data, mockPrisma)
        expect(rawMockPrisma.cronJob.create).toHaveBeenCalledTimes(1)
    })

    test('listCronJobs excludes soft-deleted when no scope', async () => {
        const jobs = await listCronJobs(undefined, mockPrisma)
        expect(jobs).toHaveLength(1)
        const call = rawMockPrisma.cronJob.findMany.mock.calls[0]?.[0]
        expect(call.where.deletedAt).toBeNull()
    })

    test('listCronJobs includes deletedAt: null filter when scope is provided', async () => {
        await listCronJobs({ channel: 'web', userId: 'user-1' }, mockPrisma)
        const call = rawMockPrisma.cronJob.findMany.mock.calls[0]?.[0]
        expect(call.where.deletedAt).toBeNull()
        expect(call.where.channel).toBe('web')
        expect(call.where.userId).toBe('user-1')
    })

    test('updateCronJob updates by id', async () => {
        await updateCronJob('job-1', { enabled: false }, mockPrisma)
        expect(rawMockPrisma.cronJob.update).toHaveBeenCalledTimes(1)
    })

    test('deleteCronJob soft-deletes by setting deletedAt', async () => {
        await deleteCronJob('job-1', mockPrisma)
        expect(rawMockPrisma.cronJob.update).toHaveBeenCalledTimes(1)
        const call = rawMockPrisma.cronJob.update.mock.calls[0]?.[0]
        expect(call.data.deletedAt).toBeInstanceOf(Date)
    })

    test('getCronJob finds by id excluding soft-deleted', async () => {
        const job = await getCronJob('job-1', mockPrisma)
        expect(job?.id).toBe('job-1')
        const call = rawMockPrisma.cronJob.findFirst.mock.calls[0]?.[0]
        expect(call.where.deletedAt).toBeNull()
    })
})
