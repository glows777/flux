/**
 * Alpaca Paper Trading Client Unit Tests
 *
 * Test scenarios:
 * - T01: isConfigured() returns false when env vars missing
 * - T02: isConfigured() returns true when config provided
 * - T03: getAccount() returns null when not configured
 * - T04: getPositions() returns [] when not configured
 * - T05: getPosition() returns null when not configured
 * - T06: getOrders() returns [] when not configured
 * - T07: Module-level singleton (getAlpacaClient) + reset
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

// --- Helpers ---

const ALPACA_KEY_ENV = 'ALPACA_API_KEY_ID'
const ALPACA_SECRET_ENV = 'ALPACA_API_SECRET_KEY'

function saveEnv() {
    return {
        keyId: process.env[ALPACA_KEY_ENV],
        secretKey: process.env[ALPACA_SECRET_ENV],
    }
}

function restoreEnv(saved: {
    keyId: string | undefined
    secretKey: string | undefined
}) {
    if (saved.keyId === undefined) {
        delete process.env[ALPACA_KEY_ENV]
    } else {
        process.env[ALPACA_KEY_ENV] = saved.keyId
    }
    if (saved.secretKey === undefined) {
        delete process.env[ALPACA_SECRET_ENV]
    } else {
        process.env[ALPACA_SECRET_ENV] = saved.secretKey
    }
}

// --- Tests ---

describe('Alpaca Paper Trading Client', () => {
    let savedEnv: { keyId: string | undefined; secretKey: string | undefined }

    beforeEach(() => {
        savedEnv = saveEnv()
        delete process.env[ALPACA_KEY_ENV]
        delete process.env[ALPACA_SECRET_ENV]
    })

    afterEach(() => {
        restoreEnv(savedEnv)
    })

    // ─── T01: isConfigured when env vars missing ───

    describe('T01: isConfigured() when env vars missing', () => {
        it('returns false when both env vars are missing', async () => {
            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient()
            expect(client.isConfigured()).toBe(false)
        })

        it('returns false when only keyId is set', async () => {
            process.env[ALPACA_KEY_ENV] = 'some-key'
            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient()
            expect(client.isConfigured()).toBe(false)
        })

        it('returns false when only secretKey is set', async () => {
            process.env[ALPACA_SECRET_ENV] = 'some-secret'
            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient()
            expect(client.isConfigured()).toBe(false)
        })
    })

    // ─── T02: isConfigured when config provided ───

    describe('T02: isConfigured() when config provided', () => {
        it('returns true when explicit config passed', async () => {
            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient({
                keyId: 'test-key',
                secretKey: 'test-secret',
            })
            expect(client.isConfigured()).toBe(true)
        })

        it('returns true when env vars are set and no explicit config', async () => {
            process.env[ALPACA_KEY_ENV] = 'env-key'
            process.env[ALPACA_SECRET_ENV] = 'env-secret'
            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient()
            expect(client.isConfigured()).toBe(true)
        })
    })

    // ─── T03: getAccount returns null when not configured ───

    describe('T03: getAccount() when not configured', () => {
        it('returns null', async () => {
            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient()
            const result = await client.getAccount()
            expect(result).toBeNull()
        })
    })

    // ─── T04: getPositions returns [] when not configured ───

    describe('T04: getPositions() when not configured', () => {
        it('returns empty array', async () => {
            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient()
            const result = await client.getPositions()
            expect(result).toEqual([])
        })
    })

    // ─── T05: getPosition returns null when not configured ───

    describe('T05: getPosition() when not configured', () => {
        it('returns null', async () => {
            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient()
            const result = await client.getPosition('AAPL')
            expect(result).toBeNull()
        })
    })

    // ─── T06: getOrders returns [] when not configured ───

    describe('T06: getOrders() when not configured', () => {
        it('returns empty array', async () => {
            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient()
            const result = await client.getOrders()
            expect(result).toEqual([])
        })

        it('returns empty array with params', async () => {
            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient()
            const result = await client.getOrders({ status: 'open', limit: 10 })
            expect(result).toEqual([])
        })
    })

    // ─── T07: Module-level singleton ───

    describe('T07: Module-level singleton and reset', () => {
        it('getAlpacaClient() returns an AlpacaClient', async () => {
            const { getAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = getAlpacaClient()
            expect(client).toBeDefined()
            expect(typeof client.isConfigured).toBe('function')
            expect(typeof client.getAccount).toBe('function')
            expect(typeof client.getPositions).toBe('function')
            expect(typeof client.getPosition).toBe('function')
            expect(typeof client.getOrders).toBe('function')
        })

        it('resetAlpacaClient() resets the singleton', async () => {
            const { getAlpacaClient, resetAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const first = getAlpacaClient()
            resetAlpacaClient()
            const second = getAlpacaClient()
            // Both should be valid clients (different objects after reset)
            expect(first).toBeDefined()
            expect(second).toBeDefined()
        })
    })

    // ─── T08: mapOrder exported and parses new fields ───

    describe('T08: mapOrder() is exported and maps new fields', () => {
        it('maps limitPrice, stopPrice, trailPercent, timeInForce from raw data', async () => {
            const { mapOrder } = await import('@/core/broker/alpaca-client')
            const raw = {
                id: 'order-123',
                symbol: 'AAPL',
                qty: '10',
                filled_qty: '5',
                side: 'buy',
                type: 'limit',
                status: 'partially_filled',
                filled_avg_price: '150.25',
                filled_at: null,
                created_at: '2024-01-01T10:00:00Z',
                limit_price: '155.00',
                stop_price: null,
                trail_percent: null,
                time_in_force: 'day',
            }
            const order = mapOrder(raw)
            expect(order.id).toBe('order-123')
            expect(order.symbol).toBe('AAPL')
            expect(order.qty).toBe(10)
            expect(order.filledQty).toBe(5)
            expect(order.limitPrice).toBe(155)
            expect(order.stopPrice).toBeNull()
            expect(order.trailPercent).toBeNull()
            expect(order.timeInForce).toBe('day')
        })

        it('maps stop order fields correctly', async () => {
            const { mapOrder } = await import('@/core/broker/alpaca-client')
            const raw = {
                id: 'order-456',
                symbol: 'TSLA',
                qty: '2',
                filled_qty: null,
                side: 'sell',
                type: 'stop',
                status: 'pending_new',
                filled_avg_price: null,
                filled_at: null,
                created_at: '2024-01-02T09:30:00Z',
                limit_price: null,
                stop_price: '200.50',
                trail_percent: null,
                time_in_force: 'gtc',
            }
            const order = mapOrder(raw)
            expect(order.limitPrice).toBeNull()
            expect(order.stopPrice).toBe(200.5)
            expect(order.trailPercent).toBeNull()
            expect(order.timeInForce).toBe('gtc')
        })

        it('maps trailing stop fields correctly', async () => {
            const { mapOrder } = await import('@/core/broker/alpaca-client')
            const raw = {
                id: 'order-789',
                symbol: 'NVDA',
                qty: '3',
                filled_qty: null,
                side: 'buy',
                type: 'trailing_stop',
                status: 'new',
                filled_avg_price: null,
                filled_at: null,
                created_at: '2024-01-03T14:00:00Z',
                limit_price: null,
                stop_price: null,
                trail_percent: '5.0',
                time_in_force: 'day',
            }
            const order = mapOrder(raw)
            expect(order.limitPrice).toBeNull()
            expect(order.stopPrice).toBeNull()
            expect(order.trailPercent).toBe(5)
            expect(order.timeInForce).toBe('day')
        })

        it('returns null for timeInForce when not provided', async () => {
            const { mapOrder } = await import('@/core/broker/alpaca-client')
            const raw = {
                id: 'order-000',
                symbol: 'GOOG',
                qty: '1',
                filled_qty: null,
                side: 'buy',
                type: 'market',
                status: 'new',
                filled_avg_price: null,
                filled_at: null,
                created_at: '2024-01-04T11:00:00Z',
                limit_price: null,
                stop_price: null,
                trail_percent: null,
                time_in_force: null,
            }
            const order = mapOrder(raw)
            expect(order.limitPrice).toBeNull()
            expect(order.stopPrice).toBeNull()
            expect(order.trailPercent).toBeNull()
            expect(order.timeInForce).toBeNull()
        })
    })

    // ─── T09: createOrder returns new fields via SDK mock ───

    describe('T09: createOrder returns limit/stop/trail/timeInForce fields', () => {
        it('createOrder passes limit_price and returns limitPrice in result', async () => {
            const mockCreateOrder = mock(() =>
                Promise.resolve({
                    id: 'sdk-order-1',
                    symbol: 'AAPL',
                    qty: '5',
                    filled_qty: null,
                    side: 'buy',
                    type: 'limit',
                    status: 'new',
                    filled_avg_price: null,
                    filled_at: null,
                    created_at: '2024-01-05T10:00:00Z',
                    limit_price: '180.00',
                    stop_price: null,
                    trail_percent: null,
                    time_in_force: 'day',
                }),
            )

            mock.module('@alpacahq/alpaca-trade-api', () => ({
                default: class MockAlpaca {
                    createOrder = mockCreateOrder
                },
            }))

            const { createAlpacaClient } = await import(
                '@/core/broker/alpaca-client'
            )
            const client = createAlpacaClient({
                keyId: 'test-key',
                secretKey: 'test-secret',
            })

            const result = await client.createOrder({
                symbol: 'AAPL',
                side: 'buy',
                qty: 5,
                type: 'limit',
                limitPrice: 180,
                timeInForce: 'day',
            })

            expect(result).not.toBeNull()
            expect(result?.limitPrice).toBe(180)
            expect(result?.stopPrice).toBeNull()
            expect(result?.trailPercent).toBeNull()
            expect(result?.timeInForce).toBe('day')
        })
    })
})
