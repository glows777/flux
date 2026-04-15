import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
    notifyError,
    notifyOrderEvent,
    notifyTrade,
} from '@/core/trading-agent/discord-hook'
import type { OrderEventNotification } from '@/core/trading-agent/types'

describe('Discord Hook', () => {
    const originalFetch = globalThis.fetch
    const mockFetch = mock(() =>
        Promise.resolve(new Response('ok', { status: 204 })),
    )

    beforeEach(() => {
        globalThis.fetch = mockFetch as unknown as typeof fetch
        process.env.DISCORD_TRADING_WEBHOOK_URL =
            'https://discord.com/api/webhooks/test'
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
        delete process.env.DISCORD_TRADING_WEBHOOK_URL
        mockFetch.mockClear()
    })

    it('sends trade notification with correct format', async () => {
        await notifyTrade({
            symbol: 'NVDA',
            side: 'buy',
            qty: 10,
            price: 140.5,
            reasoning: 'MA crossover',
        })
        expect(mockFetch).toHaveBeenCalledTimes(1)
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.embeds[0].title).toContain('NVDA')
        expect(body.embeds[0].title).toContain('BUY')
    })

    it('sends error notification', async () => {
        await notifyError('heartbeat failed: timeout')
        expect(mockFetch).toHaveBeenCalledTimes(1)
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.embeds[0].color).toBe(0xff0000)
    })

    it('silently ignores when webhook URL is not configured', async () => {
        delete process.env.DISCORD_TRADING_WEBHOOK_URL
        await notifyTrade({
            symbol: 'NVDA',
            side: 'buy',
            qty: 10,
            price: 140,
            reasoning: 'test',
        })
        expect(mockFetch).not.toHaveBeenCalled()
    })

    it('never throws even if fetch fails', async () => {
        globalThis.fetch = mock(() =>
            Promise.reject(new Error('network error')),
        ) as unknown as typeof fetch
        await expect(
            notifyTrade({
                symbol: 'NVDA',
                side: 'buy',
                qty: 10,
                price: 140,
                reasoning: 'test',
            }),
        ).resolves.toBeUndefined()
    })

    describe('notifyOrderEvent', () => {
        it('sends correct embed for "new" event (limit order)', async () => {
            const notification: OrderEventNotification = {
                event: 'new',
                symbol: 'AAPL',
                side: 'buy',
                qty: 5,
                type: 'limit',
                limitPrice: 180.0,
                timeInForce: 'day',
            }
            await notifyOrderEvent(notification)
            expect(mockFetch).toHaveBeenCalledTimes(1)
            const body = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(body.embeds[0].title).toContain('下单')
            expect(body.embeds[0].title).toContain('AAPL')
            expect(body.embeds[0].title).toContain('limit')
            expect(body.embeds[0].title).toContain('buy')
            expect(body.embeds[0].title).toContain('$180')
            expect(body.embeds[0].title).toContain('day')
            expect(body.embeds[0].color).toBe(0x3b82f6)
            expect(body.embeds[0].timestamp).toBeDefined()
        })

        it('sends correct embed for "fill" event', async () => {
            const notification: OrderEventNotification = {
                event: 'fill',
                symbol: 'TSLA',
                side: 'sell',
                qty: 3,
                type: 'market',
                filledQty: 3,
                filledAvgPrice: 250.5,
            }
            await notifyOrderEvent(notification)
            expect(mockFetch).toHaveBeenCalledTimes(1)
            const body = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(body.embeds[0].title).toContain('成交')
            expect(body.embeds[0].title).toContain('TSLA')
            expect(body.embeds[0].title).toContain('$250.5')
            expect(body.embeds[0].color).toBe(0x10b981)
        })

        it('sends correct embed for "canceled" event', async () => {
            const notification: OrderEventNotification = {
                event: 'canceled',
                symbol: 'NVDA',
                side: 'buy',
                qty: 2,
                type: 'limit',
                limitPrice: 500.0,
            }
            await notifyOrderEvent(notification)
            expect(mockFetch).toHaveBeenCalledTimes(1)
            const body = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(body.embeds[0].title).toContain('取消')
            expect(body.embeds[0].title).toContain('NVDA')
            expect(body.embeds[0].color).toBe(0x6b7280)
        })

        it('does nothing without webhook URL', async () => {
            delete process.env.DISCORD_TRADING_WEBHOOK_URL
            const notification: OrderEventNotification = {
                event: 'fill',
                symbol: 'AAPL',
                side: 'buy',
                qty: 1,
                type: 'market',
            }
            await notifyOrderEvent(notification)
            expect(mockFetch).not.toHaveBeenCalled()
        })

        it('formats partial fill with correct qty ratio in title', async () => {
            const notification: OrderEventNotification = {
                event: 'partial_fill',
                symbol: 'MSFT',
                side: 'buy',
                qty: 10,
                type: 'limit',
                limitPrice: 400.0,
                filledQty: 4,
                filledAvgPrice: 399.5,
            }
            await notifyOrderEvent(notification)
            expect(mockFetch).toHaveBeenCalledTimes(1)
            const body = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(body.embeds[0].title).toContain('部分成交')
            expect(body.embeds[0].title).toContain('4/10')
            expect(body.embeds[0].title).toContain('$399.5')
            expect(body.embeds[0].color).toBe(0xf59e0b)
        })
    })
})
