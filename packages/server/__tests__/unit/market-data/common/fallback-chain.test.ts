import { describe, expect, mock, test } from 'bun:test'
import { FallbackChain } from '@/core/market-data/common/fallback-chain'

describe('FallbackChain', () => {
    test('returns result from first provider on success', async () => {
        const chain = new FallbackChain<string>([
            { name: 'primary', fetch: async () => 'primary-result', timeout: 3000 },
            { name: 'fallback', fetch: async () => 'fallback-result', timeout: 3000 },
        ])
        const result = await chain.execute('key')
        expect(result).toBe('primary-result')
    })

    test('falls back to second provider on primary failure', async () => {
        const chain = new FallbackChain<string>([
            { name: 'primary', fetch: async () => { throw new Error('down') }, timeout: 3000 },
            { name: 'fallback', fetch: async () => 'fallback-result', timeout: 3000 },
        ])
        const result = await chain.execute('key')
        expect(result).toBe('fallback-result')
    })

    test('falls back on timeout', async () => {
        const chain = new FallbackChain<string>([
            { name: 'slow', fetch: () => new Promise(r => setTimeout(() => r('late'), 5000)), timeout: 50 },
            { name: 'fast', fetch: async () => 'fast-result', timeout: 3000 },
        ])
        const result = await chain.execute('key')
        expect(result).toBe('fast-result')
    })

    test('throws when all providers fail', async () => {
        const chain = new FallbackChain<string>([
            { name: 'a', fetch: async () => { throw new Error('a-fail') }, timeout: 3000 },
            { name: 'b', fetch: async () => { throw new Error('b-fail') }, timeout: 3000 },
        ])
        expect(chain.execute('key')).rejects.toThrow()
    })
})

describe('FallbackChain — CircuitBreaker', () => {
    test('skips provider after failureThreshold consecutive failures', async () => {
        const primaryFetch = mock(async () => { throw new Error('fail') })
        const fallbackFetch = mock(async () => 'fallback')

        const chain = new FallbackChain<string>([
            { name: 'primary', fetch: primaryFetch, timeout: 3000 },
            { name: 'fallback', fetch: fallbackFetch, timeout: 3000 },
        ], { circuitBreaker: { failureThreshold: 2, cooldownMs: 5000 } })

        await chain.execute('k1')
        await chain.execute('k2')
        expect(primaryFetch).toHaveBeenCalledTimes(2)

        // 3rd call: primary is open, skipped
        primaryFetch.mockClear()
        await chain.execute('k3')
        expect(primaryFetch).toHaveBeenCalledTimes(0)
    })

    test('retries provider after cooldown period', async () => {
        const primaryFetch = mock(async () => { throw new Error('fail') })
        const fallbackFetch = mock(async () => 'fallback')

        const chain = new FallbackChain<string>([
            { name: 'primary', fetch: primaryFetch, timeout: 3000 },
            { name: 'fallback', fetch: fallbackFetch, timeout: 3000 },
        ], { circuitBreaker: { failureThreshold: 1, cooldownMs: 50 } })

        // Trip the breaker
        await chain.execute('k1')
        expect(primaryFetch).toHaveBeenCalledTimes(1)

        // During cooldown: primary skipped
        primaryFetch.mockClear()
        await chain.execute('k2')
        expect(primaryFetch).toHaveBeenCalledTimes(0)

        // After cooldown: primary retried
        await new Promise(r => setTimeout(r, 60))
        primaryFetch.mockClear()
        primaryFetch.mockImplementation(async () => 'recovered')
        const result = await chain.execute('k3')
        expect(primaryFetch).toHaveBeenCalledTimes(1)
        expect(result).toBe('recovered')
    })
})
