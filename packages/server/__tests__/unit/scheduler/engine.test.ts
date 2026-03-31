import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { CronScheduler } from '@/scheduler/engine'

describe('CronScheduler', () => {
    test('parseSchedule converts every:5m to cron expression', () => {
        const scheduler = new CronScheduler({
            channels: new Map(),
            gateway: {} as any,
            prisma: { cronJob: { findMany: mock(() => Promise.resolve([])), update: mock(), findUnique: mock() } } as any,
        })
        const result = (scheduler as any).parseSchedule('every:5m')
        expect(result).toBe('0 */5 * * * *')
    })

    test('parseSchedule returns null for invalid expression', () => {
        const scheduler = new CronScheduler({
            channels: new Map(),
            gateway: {} as any,
            prisma: { cronJob: { findMany: mock(() => Promise.resolve([])), update: mock(), findUnique: mock() } } as any,
        })
        const result = (scheduler as any).parseSchedule('invalid')
        expect(result).toBeNull()
    })

    test('start loads enabled jobs from DB', async () => {
        const mockFindMany = mock(() => Promise.resolve([]))
        const scheduler = new CronScheduler({
            channels: new Map(),
            gateway: {} as any,
            prisma: { cronJob: { findMany: mockFindMany, update: mock(), findUnique: mock() } } as any,
        })
        await scheduler.start()
        expect(mockFindMany).toHaveBeenCalledTimes(1)
        await scheduler.stop()
    })
})
