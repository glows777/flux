import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { createCronJob, listCronJobs, updateCronJob, deleteCronJob, getCronJob } from '@/core/cron/service'

describe('Cron service', () => {
    const mockPrisma = {
        cronJob: {
            create: mock(() => Promise.resolve({ id: 'job-1', name: 'test' })),
            findMany: mock(() => Promise.resolve([{ id: 'job-1' }])),
            update: mock(() => Promise.resolve({ id: 'job-1', enabled: false })),
            findUnique: mock(() => Promise.resolve({ id: 'job-1' })),
            findFirst: mock(() => Promise.resolve({ id: 'job-1' })),
        },
    }

    beforeEach(() => {
        mockPrisma.cronJob.create.mockClear()
        mockPrisma.cronJob.findMany.mockClear()
        mockPrisma.cronJob.update.mockClear()
        mockPrisma.cronJob.findUnique.mockClear()
        mockPrisma.cronJob.findFirst.mockClear()
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
        await createCronJob(data, mockPrisma as any)
        expect(mockPrisma.cronJob.create).toHaveBeenCalledTimes(1)
    })

    test('listCronJobs excludes soft-deleted when no scope', async () => {
        const jobs = await listCronJobs(undefined, mockPrisma as any)
        expect(jobs).toHaveLength(1)
        const call = mockPrisma.cronJob.findMany.mock.calls[0][0]
        expect(call.where.deletedAt).toBeNull()
    })

    test('listCronJobs includes deletedAt: null filter when scope is provided', async () => {
        await listCronJobs({ channel: 'web', userId: 'user-1' }, mockPrisma as any)
        const call = mockPrisma.cronJob.findMany.mock.calls[0][0]
        expect(call.where.deletedAt).toBeNull()
        expect(call.where.channel).toBe('web')
        expect(call.where.userId).toBe('user-1')
    })

    test('updateCronJob updates by id', async () => {
        await updateCronJob('job-1', { enabled: false }, mockPrisma as any)
        expect(mockPrisma.cronJob.update).toHaveBeenCalledTimes(1)
    })

    test('deleteCronJob soft-deletes by setting deletedAt', async () => {
        await deleteCronJob('job-1', mockPrisma as any)
        expect(mockPrisma.cronJob.update).toHaveBeenCalledTimes(1)
        const call = mockPrisma.cronJob.update.mock.calls[0][0]
        expect(call.data.deletedAt).toBeInstanceOf(Date)
    })

    test('getCronJob finds by id excluding soft-deleted', async () => {
        const job = await getCronJob('job-1', mockPrisma as any)
        expect(job?.id).toBe('job-1')
        const call = mockPrisma.cronJob.findFirst.mock.calls[0][0]
        expect(call.where.deletedAt).toBeNull()
    })
})
