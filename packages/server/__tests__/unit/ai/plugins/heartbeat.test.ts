import { describe, expect, mock, test } from 'bun:test'
import {
    type HeartbeatPluginDeps,
    heartbeatPlugin,
} from '../../../../src/core/ai/plugins/heartbeat'
import type { HeartbeatContext } from '../../../../src/core/trading-agent/types'

const makeCtx = () => ({
    sessionId: 's1',
    channel: 'cron',
    mode: 'trigger' as const,
    agentType: 'trading-agent',
    rawMessages: [],
    meta: new Map(),
})

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'order-1',
    symbol: 'AAPL',
    side: 'buy',
    qty: 10,
    type: 'market',
    status: 'open',
    timeInForce: 'day',
    limitPrice: null,
    stopPrice: null,
    filledQty: null,
    filledAvgPrice: null,
    filledAt: null,
    ...overrides,
})

const makeDeps = (overrides: Record<string, unknown> = {}) => ({
    alpacaClient: {
        getAccount: mock(() => Promise.resolve({ equity: 10000 })),
        getOrders: mock(() => Promise.resolve([])),
    },
    db: {
        order: {
            findUnique: mock(() => Promise.resolve(null)),
            update: mock(() => Promise.resolve({})),
            create: mock(() => Promise.resolve({})),
        },
        tradingBaseline: {
            findFirst: mock(() => Promise.resolve(null)),
            create: mock(() => Promise.resolve({ baseline: 10000 })),
        },
    },
    memoryDeps: {
        db: {
            memoryVersion: {
                findFirst: mock(() =>
                    Promise.resolve({ content: 'strategy content' }),
                ),
                create: mock(() => Promise.resolve({ id: 'v1' })),
            },
        },
    },
    ...overrides,
})

// Mock module-level dependencies
mock.module('../../../../src/core/trading-agent/loop', () => ({
    loadOrCreateBaseline: mock(() => Promise.resolve(10000)),
    getMarketStatus: mock(() => 'open'),
}))

mock.module('../../../../src/core/ai/memory/store', () => ({
    getSlotContent: mock(() => Promise.resolve('strategy content')),
    writeSlot: mock(() => Promise.resolve()),
    getSlotHistory: mock(() => Promise.resolve([])),
    SlotContentTooLongError: class SlotContentTooLongError extends Error {
        constructor(slot: string, _actual: number, _limit: number) {
            super(`Slot "${slot}" content too long`)
            this.name = 'SlotContentTooLongError'
        }
    },
}))

mock.module('../../../../src/core/trading-agent/discord-hook', () => ({
    notifyError: mock(() => Promise.resolve()),
}))

describe('heartbeatPlugin', () => {
    test('has name "heartbeat"', () => {
        const plugin = heartbeatPlugin(
            makeDeps() as unknown as HeartbeatPluginDeps,
        )
        expect(plugin.name).toBe('heartbeat')
    })

    test('contribute returns live.runtime segment and maxSteps override', async () => {
        const plugin = heartbeatPlugin({
            alpacaClient: {
                getAccount: mock(async () => ({ equity: 100000 })),
                getOrders: mock(async () => []),
            } as never,
            db: {} as never,
        })

        const ctx = {
            sessionId: 's1',
            channel: 'cron',
            mode: 'trigger' as const,
            agentType: 'auto-trading-agent' as const,
            rawMessages: [],
            meta: new Map([
                [
                    'heartbeatContext',
                    {
                        timestamp: new Date(),
                        marketStatus: 'open',
                        equity: 100000,
                        baseline: 100000,
                        progress: 0,
                    },
                ],
            ]),
        }

        const output = await plugin.contribute?.(ctx as never)

        expect(output?.segments?.[0].kind).toBe('live.runtime')
        expect(output?.params?.maxSteps).toBeDefined()
    })

    test('beforeRun sets heartbeat context in meta', async () => {
        const deps = makeDeps()
        const plugin = heartbeatPlugin(deps as unknown as HeartbeatPluginDeps)
        const ctx = makeCtx()
        expect(plugin.beforeRun).toBeDefined()
        if (!plugin.beforeRun) throw new Error('Expected beforeRun hook')

        await plugin.beforeRun(ctx as never)
        expect(ctx.meta.has('heartbeatContext')).toBe(true)
        const hbCtx = ctx.meta.get('heartbeatContext') as
            | HeartbeatContext
            | undefined
        if (!hbCtx) throw new Error('Expected heartbeat context')
        expect(hbCtx.equity).toBe(10000)
        expect(hbCtx.baseline).toBe(10000)
    })

    test('does NOT have afterRun hook', () => {
        const plugin = heartbeatPlugin(
            makeDeps() as unknown as HeartbeatPluginDeps,
        )
        expect(plugin.afterRun).toBeUndefined()
    })

    test('onError calls notifyError', async () => {
        const { notifyError } = await import(
            '../../../../src/core/trading-agent/discord-hook'
        )
        const plugin = heartbeatPlugin(
            makeDeps() as unknown as HeartbeatPluginDeps,
        )
        const ctx = makeCtx()
        expect(plugin.onError).toBeDefined()
        if (!plugin.onError) throw new Error('Expected onError hook')

        await plugin.onError(ctx, new Error('test error'))
        expect(notifyError).toHaveBeenCalledWith('test error')
    })

    describe('syncOrdersFromAlpaca', () => {
        test('creates DB record for unknown open orders', async () => {
            const order = makeOrder()
            const deps = makeDeps()
            ;(
                deps.alpacaClient.getOrders as ReturnType<typeof mock>
            ).mockImplementation(() => Promise.resolve([order]))
            ;(
                deps.db.order.findUnique as ReturnType<typeof mock>
            ).mockImplementation(() => Promise.resolve(null))

            const plugin = heartbeatPlugin(
                deps as unknown as HeartbeatPluginDeps,
            )
            const ctx = makeCtx()
            expect(plugin.beforeRun).toBeDefined()
            if (!plugin.beforeRun) throw new Error('Expected beforeRun hook')

            await plugin.beforeRun(ctx as never)

            expect(deps.db.order.findUnique).toHaveBeenCalledWith({
                where: { alpacaOrderId: 'order-1' },
            })
            expect(deps.db.order.create).toHaveBeenCalled()
            const createCall = (deps.db.order.create as ReturnType<typeof mock>)
                .mock.calls[0]
            const createArgs = createCall[0] as {
                data: { alpacaOrderId: string; symbol: string }
            }
            expect(createArgs.data.alpacaOrderId).toBe('order-1')
            expect(createArgs.data.symbol).toBe('AAPL')
        })

        test('updates status for known orders with different status', async () => {
            const order = makeOrder({
                status: 'filled',
                filledQty: 10,
                filledAvgPrice: 150,
            })
            const deps = makeDeps()
            ;(
                deps.alpacaClient.getOrders as ReturnType<typeof mock>
            ).mockImplementation(() => Promise.resolve([order]))
            ;(
                deps.db.order.findUnique as ReturnType<typeof mock>
            ).mockImplementation(() => Promise.resolve({ status: 'new' }))

            const plugin = heartbeatPlugin(
                deps as unknown as HeartbeatPluginDeps,
            )
            const ctx = makeCtx()
            expect(plugin.beforeRun).toBeDefined()
            if (!plugin.beforeRun) throw new Error('Expected beforeRun hook')

            await plugin.beforeRun(ctx as never)

            expect(deps.db.order.update).toHaveBeenCalled()
            const updateCall = (deps.db.order.update as ReturnType<typeof mock>)
                .mock.calls[0]
            const updateArgs = updateCall[0] as {
                where: { alpacaOrderId: string }
                data: { status: string }
            }
            expect(updateArgs.where.alpacaOrderId).toBe('order-1')
            expect(updateArgs.data.status).toBe('filled')
        })

        test('skips update when known order has same status', async () => {
            const order = makeOrder({ status: 'open' })
            const deps = makeDeps()
            ;(
                deps.alpacaClient.getOrders as ReturnType<typeof mock>
            ).mockImplementation(() => Promise.resolve([order]))
            ;(
                deps.db.order.findUnique as ReturnType<typeof mock>
            ).mockImplementation(() => Promise.resolve({ status: 'open' }))

            const plugin = heartbeatPlugin(
                deps as unknown as HeartbeatPluginDeps,
            )
            const ctx = makeCtx()
            expect(plugin.beforeRun).toBeDefined()
            if (!plugin.beforeRun) throw new Error('Expected beforeRun hook')

            await plugin.beforeRun(ctx as never)

            expect(deps.db.order.update).not.toHaveBeenCalled()
        })

        test('failure does not block heartbeat context being set', async () => {
            const deps = makeDeps()
            ;(
                deps.alpacaClient.getOrders as ReturnType<typeof mock>
            ).mockImplementation(() =>
                Promise.reject(new Error('network failure')),
            )

            const plugin = heartbeatPlugin(
                deps as unknown as HeartbeatPluginDeps,
            )
            const ctx = makeCtx()
            expect(plugin.beforeRun).toBeDefined()
            if (!plugin.beforeRun) throw new Error('Expected beforeRun hook')

            await plugin.beforeRun(ctx as never)

            // heartbeat context should still be set
            expect(ctx.meta.has('heartbeatContext')).toBe(true)
        })
    })
})
