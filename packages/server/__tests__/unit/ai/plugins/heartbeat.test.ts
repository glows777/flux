import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { heartbeatPlugin } from '../../../../src/core/ai/plugins/heartbeat'
import type { HookContext } from '../../../../src/core/ai/runtime/types'

const makeCtx = (): HookContext => ({
  sessionId: 's1',
  channel: 'cron',
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
    readDocument: mock(() => Promise.resolve('strategy content')),
    writeDocument: mock(() => Promise.resolve()),
  },
  ...overrides,
})

// Mock module-level dependencies
mock.module('../../../../src/core/trading-agent/loop', () => ({
  loadOrCreateBaseline: mock(() => Promise.resolve(10000)),
  getMarketStatus: mock(() => 'open'),
}))

mock.module('../../../../src/core/ai/memory/store', () => ({
  readDocument: mock(() => Promise.resolve('strategy content')),
  writeDocument: mock(() => Promise.resolve()),
}))

mock.module('../../../../src/core/trading-agent/discord-hook', () => ({
  notifyError: mock(() => Promise.resolve()),
}))

describe('heartbeatPlugin', () => {
  test('has name "heartbeat"', () => {
    const plugin = heartbeatPlugin(makeDeps() as any)
    expect(plugin.name).toBe('heartbeat')
  })

  test('transformParams sets maxSteps to 70', () => {
    const plugin = heartbeatPlugin(makeDeps() as any)
    const ctx = makeCtx()
    const result = plugin.transformParams!(ctx, { maxSteps: 20 })
    expect((result as { maxSteps: number }).maxSteps).toBe(70)
  })

  test('beforeChat sets heartbeat context in meta', async () => {
    const deps = makeDeps()
    const plugin = heartbeatPlugin(deps as any)
    const ctx = makeCtx()
    await plugin.beforeChat!(ctx)
    expect(ctx.meta.has('heartbeat')).toBe(true)
    const hbCtx = ctx.meta.get('heartbeat') as any
    expect(hbCtx.equity).toBe(10000)
    expect(hbCtx.baseline).toBe(10000)
  })

  test('does NOT have afterChat hook', () => {
    const plugin = heartbeatPlugin(makeDeps() as any)
    expect(plugin.afterChat).toBeUndefined()
  })

  test('onError calls notifyError', async () => {
    const { notifyError } = await import('../../../../src/core/trading-agent/discord-hook')
    const plugin = heartbeatPlugin(makeDeps() as any)
    const ctx = makeCtx()
    await plugin.onError!(ctx, new Error('test error'))
    expect(notifyError).toHaveBeenCalledWith('test error')
  })

  describe('syncOrdersFromAlpaca', () => {
    test('creates DB record for unknown open orders', async () => {
      const order = makeOrder()
      const deps = makeDeps()
      ;(deps.alpacaClient.getOrders as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve([order])
      )
      ;(deps.db.order.findUnique as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(null)
      )

      const plugin = heartbeatPlugin(deps as any)
      const ctx = makeCtx()
      await plugin.beforeChat!(ctx)

      expect(deps.db.order.findUnique).toHaveBeenCalledWith({
        where: { alpacaOrderId: 'order-1' },
      })
      expect(deps.db.order.create).toHaveBeenCalled()
      const createCall = (deps.db.order.create as ReturnType<typeof mock>).mock.calls[0]
      expect((createCall[0] as any).data.alpacaOrderId).toBe('order-1')
      expect((createCall[0] as any).data.symbol).toBe('AAPL')
    })

    test('updates status for known orders with different status', async () => {
      const order = makeOrder({ status: 'filled', filledQty: 10, filledAvgPrice: 150 })
      const deps = makeDeps()
      ;(deps.alpacaClient.getOrders as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve([order])
      )
      ;(deps.db.order.findUnique as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve({ status: 'new' })
      )

      const plugin = heartbeatPlugin(deps as any)
      const ctx = makeCtx()
      await plugin.beforeChat!(ctx)

      expect(deps.db.order.update).toHaveBeenCalled()
      const updateCall = (deps.db.order.update as ReturnType<typeof mock>).mock.calls[0]
      expect((updateCall[0] as any).where.alpacaOrderId).toBe('order-1')
      expect((updateCall[0] as any).data.status).toBe('filled')
    })

    test('skips update when known order has same status', async () => {
      const order = makeOrder({ status: 'open' })
      const deps = makeDeps()
      ;(deps.alpacaClient.getOrders as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve([order])
      )
      ;(deps.db.order.findUnique as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve({ status: 'open' })
      )

      const plugin = heartbeatPlugin(deps as any)
      const ctx = makeCtx()
      await plugin.beforeChat!(ctx)

      expect(deps.db.order.update).not.toHaveBeenCalled()
    })

    test('failure does not block heartbeat context being set', async () => {
      const deps = makeDeps()
      ;(deps.alpacaClient.getOrders as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.reject(new Error('network failure'))
      )

      const plugin = heartbeatPlugin(deps as any)
      const ctx = makeCtx()
      await plugin.beforeChat!(ctx)

      // heartbeat context should still be set
      expect(ctx.meta.has('heartbeat')).toBe(true)
    })
  })
})
