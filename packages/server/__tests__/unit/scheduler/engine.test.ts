import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { CronScheduler, parseSchedule } from '@/scheduler/engine'

describe('CronScheduler', () => {
    test('parseSchedule converts every:5m to cron expression', () => {
        const result = parseSchedule('every:5m')
        expect(result).toBe('0 */5 * * * *')
    })

    test('parseSchedule returns null for invalid expression', () => {
        const result = parseSchedule('invalid')
        expect(result).toBeNull()
    })

    test('start loads enabled jobs from DB', async () => {
        const mockFindMany = mock(() => Promise.resolve([]))
        const scheduler = new CronScheduler({
            gateway: {} as any,
            prisma: { cronJob: { findMany: mockFindMany, update: mock(), findUnique: mock() } } as any,
        })
        await scheduler.start()
        expect(mockFindMany).toHaveBeenCalledTimes(1)
        await scheduler.stop()
    })
})
