import { describe, expect, it } from 'bun:test'
import { createAlpacaClient } from '@/core/broker/alpaca-client'

describe('AlpacaClient trading methods', () => {
    describe('when not configured', () => {
        const client = createAlpacaClient({ keyId: '', secretKey: '' })

        it('createOrder returns null', async () => {
            const result = await client.createOrder({
                symbol: 'AAPL',
                side: 'buy',
                qty: 1,
                type: 'market',
            })
            expect(result).toBeNull()
        })

        it('cancelOrder returns false', async () => {
            expect(await client.cancelOrder('fake-id')).toBe(false)
        })

        it('closePosition returns null', async () => {
            expect(await client.closePosition('AAPL')).toBeNull()
        })
    })
})
