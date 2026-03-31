/**
 * withTimeout utility unit tests
 *
 * - T06-01: resolves when promise settles before deadline
 * - T06-02: rejects with timeout Error when promise exceeds deadline
 * - T06-03: propagates original rejection untouched
 * - T06-04: timeout Error message includes label and ms
 */

import { describe, expect, it } from 'bun:test'
import { withTimeout } from '@/core/ai/timeout'

describe('withTimeout', () => {
    it('T06-01: resolves when promise settles before deadline', async () => {
        const result = await withTimeout(
            Promise.resolve('ok'),
            1_000,
            'fast-op',
        )
        expect(result).toBe('ok')
    })

    it('T06-02: rejects with timeout Error when promise exceeds deadline', async () => {
        const slow = new Promise<string>((resolve) =>
            setTimeout(() => resolve('late'), 5_000),
        )

        await expect(withTimeout(slow, 50, 'slow-op')).rejects.toThrow(
            'slow-op timed out after 50ms',
        )
    })

    it('T06-03: propagates original rejection untouched', async () => {
        const failing = Promise.reject(new Error('original error'))

        await expect(
            withTimeout(failing, 1_000, 'fail-op'),
        ).rejects.toThrow('original error')
    })

    it('T06-04: timeout Error message includes label and ms', async () => {
        const slow = new Promise<void>((resolve) =>
            setTimeout(resolve, 5_000),
        )

        try {
            await withTimeout(slow, 30, 'myLabel')
            throw new Error('should not reach')
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toBe(
                'myLabel timed out after 30ms',
            )
        }
    })
})
