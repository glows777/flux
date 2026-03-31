import { describe, expect, test } from 'bun:test'
import { ConcurrencyLimiter } from '@/core/market-data/common/concurrency'

describe('ConcurrencyLimiter', () => {
    test('limits concurrent executions', async () => {
        const limiter = new ConcurrencyLimiter(2)
        let running = 0
        let maxRunning = 0

        const task = () =>
            limiter.run(async () => {
                running++
                maxRunning = Math.max(maxRunning, running)
                await new Promise(r => setTimeout(r, 50))
                running--
                return 'done'
            })

        const results = await Promise.all([
            task(),
            task(),
            task(),
            task(),
            task(),
        ])
        expect(results).toEqual(['done', 'done', 'done', 'done', 'done'])
        expect(maxRunning).toBeLessThanOrEqual(2)
    })

    test('propagates errors without blocking queue', async () => {
        const limiter = new ConcurrencyLimiter(1)
        const p1 = limiter.run(async () => {
            throw new Error('fail')
        })
        const p2 = limiter.run(async () => 'success')

        await expect(p1).rejects.toThrow('fail')
        const result = await p2
        expect(result).toBe('success')
    })
})
