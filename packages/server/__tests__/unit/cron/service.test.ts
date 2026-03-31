import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { createCronJob, listCronJobs, updateCronJob, deleteCronJob, getCronJob } from '@/core/cron/service'

describe('Cron service', () => {
    const mockPrisma = {
        cronJob: {
            create: mock(() => Promise.resolve({ id: 'job-1', name: 'test' })),
            findMany: mock(() => Promise.resolve([{ id: 'job-1' }])),
            update: mock(() => Promise.resolve({ id: 'job-1', enabled: false })),
            delete: mock(() => Promise.resolve({ id: 'job-1' })),
            findUnique: mock(() => Promise.resolve({ id: 'job-1' })),
        },
    }

    beforeEach(() => {
        mockPrisma.cronJob.create.mockClear()
        mockPrisma.cronJob.findMany.mockClear()
        mockPrisma.cronJob.update.mockClear()
        mockPrisma.cronJob.delete.mockClear()
        mockPrisma.cronJob.findUnique.mockClear()
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

    test('listCronJobs returns all jobs when no scope', async () => {
        const jobs = await listCronJobs(undefined, mockPrisma as any)
        expect(jobs).toHaveLength(1)
    })

    test('updateCronJob updates by id', async () => {
        await updateCronJob('job-1', { enabled: false }, mockPrisma as any)
        expect(mockPrisma.cronJob.update).toHaveBeenCalledTimes(1)
    })

    test('deleteCronJob deletes by id', async () => {
        await deleteCronJob('job-1', mockPrisma as any)
        expect(mockPrisma.cronJob.delete).toHaveBeenCalledTimes(1)
    })

    test('getCronJob finds by id', async () => {
        const job = await getCronJob('job-1', mockPrisma as any)
        expect(job?.id).toBe('job-1')
    })
})
