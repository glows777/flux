/**
 * Unit tests for createTradingAgentTools
 *
 * Verifies:
 * 1. Exactly 14 tools are returned
 * 2. All expected tool names are present
 * 3. placeOrder does NOT invoke guard checks (no getAccount, no getTodayFilledOrders guard logic)
 * 4. placeOrder validates order type params
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { createTradingAgentTools } from '@/core/trading-agent/tools'
import type { TradingAgentDeps } from '@/core/trading-agent/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAlpacaClient(overrides: Record<string, unknown> = {}) {
    return {
        isConfigured: mock(() => true),
        getAccount: mock(async () => ({
            equity: 100_000,
            cash: 50_000,
            buyingPower: 50_000,
            lastEquity: 99_000,
            longMarketValue: 50_000,
        })),
        getPositions: mock(async () => []),
        getPosition: mock(async () => null),
        getOrders: mock(async () => []),
        createOrder: mock(async () => ({
            id: 'alpaca-order-1',
            symbol: 'AAPL',
            qty: 1,
            filledQty: null,
            side: 'buy' as const,
            type: 'market',
            status: 'new',
            filledAvgPrice: null,
            filledAt: null,
            createdAt: new Date().toISOString(),
        })),
        cancelOrder: mock(async () => true),
        closePosition: mock(async () => null),
        getLastTrade: mock(async () => ({ price: 150 })),
        ...overrides,
    }
}

function makeDb() {
    return {
        order: {
            create: mock(async () => ({})),
            findMany: mock(async () => []),
            findUnique: mock(async () => null),
            update: mock(async () => ({})),
        },
    }
}

function makeToolDeps() {
    return {
        getQuote: mock(async () => ({ price: 150, change: 0, volume: 1000 })),
        getInfo: mock(async () => ({
            name: 'Apple',
            pe: 25,
            marketCap: 3_000_000_000_000,
            eps: 6,
            dividendYield: 0.5,
            sector: 'Technology',
        })),
        getHistoryRaw: mock(async () => []),
        getNews: mock(async () => []),
        getReportFromCache: mock(async () => null),
        searchStocks: mock(async () => []),
    }
}

function makeMemoryDeps() {
    const db = {
        memoryDocument: {
            findFirst: mock(async () => null),
            findMany: mock(async () => []),
            upsert: mock(async () => ({})),
            update: mock(async () => ({})),
            delete: mock(async () => ({})),
        },
    }
    return { db } as unknown as NonNullable<TradingAgentDeps['memoryDeps']>
}

function makeResearchDeps(): NonNullable<TradingAgentDeps['researchDeps']> {
    return {
        searchWeb: mock(async () => ({ results: [] })),
        // @ts-ignore — minimal stub; LanguageModel not needed for unit tests
        generateText: mock(async () => ({ text: '' })),
        // @ts-ignore — minimal stub
        searchModel: {} as import('ai').LanguageModel,
        readPage: mock(async () => ({
            content: '',
            bytesFetched: 0,
            truncated: false,
            source: 'direct' as const,
        })),
        summarize: mock(async () => ''),
    }
}

function makeDeps(overrides: Partial<TradingAgentDeps> = {}): TradingAgentDeps {
    return {
        alpacaClient: makeAlpacaClient(),
        db: makeDb() as unknown as TradingAgentDeps['db'],
        toolDeps: makeToolDeps(),
        memoryDeps: makeMemoryDeps(),
        researchDeps: makeResearchDeps(),
        ...overrides,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createTradingAgentTools', () => {
    it('returns exactly 14 tools', () => {
        const tools = createTradingAgentTools(makeDeps())
        expect(Object.keys(tools).length).toBe(14)
    })

    it('contains all expected tool names', () => {
        const tools = createTradingAgentTools(makeDeps())
        const names = Object.keys(tools)

        const expected = [
            'memory_read',
            'memory_write',
            'memory_list',
            'getHistory',
            'calculateIndicators',
            'getPortfolio',
            'closePosition',
            'cancelOrder',
            'webSearch',
            'webFetch',
            'placeOrder',
            'getQuote',
            'getTradeHistory',
            'getPendingOrders',
        ]

        for (const name of expected) {
            expect(names).toContain(name)
        }
    })

    it('placeOrder does NOT call guard checks (no getAccount for guards)', async () => {
        const alpacaClient = makeAlpacaClient()
        const db = makeDb()
        const deps = makeDeps({ alpacaClient, db: db as unknown as TradingAgentDeps['db'] })

        const { placeOrder } = createTradingAgentTools(deps)

        // Execute placeOrder
        const result = await placeOrder.execute({
            symbol: 'AAPL',
            side: 'buy',
            qty: 1,
            type: 'market',
            reasoning: 'test buy with no guard',
        }, { messages: [], toolCallId: 'test' })

        // createOrder must have been called
        expect(alpacaClient.createOrder).toHaveBeenCalledTimes(1)
        expect(alpacaClient.createOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                symbol: 'AAPL',
                side: 'buy',
                qty: 1,
                type: 'market',
            }),
        )

        // getAccount must NOT have been called (no guard check)
        expect(alpacaClient.getAccount).not.toHaveBeenCalled()

        // DB order.create must have been called once
        expect(db.order.create).toHaveBeenCalledTimes(1)

        expect(result).toMatchObject({ success: true })
    })

    it('placeOrder returns error when alpacaClient is not configured', async () => {
        const alpacaClient = makeAlpacaClient({ isConfigured: mock(() => false) })
        const deps = makeDeps({ alpacaClient })

        const { placeOrder } = createTradingAgentTools(deps)

        const result = await placeOrder.execute({
            symbol: 'AAPL',
            side: 'buy',
            qty: 1,
            type: 'market',
            reasoning: 'test',
        }, { messages: [], toolCallId: 'test' })

        expect(result).toMatchObject({ error: 'Alpaca 未配置' })
        expect(alpacaClient.createOrder).not.toHaveBeenCalled()
    })

    it('getQuote calls alpacaClient.getLastTrade and returns price', async () => {
        const alpacaClient = makeAlpacaClient({
            getLastTrade: mock(async () => ({ price: 195.5 })),
        })
        const deps = makeDeps({ alpacaClient })

        const { getQuote } = createTradingAgentTools(deps)

        const result = await getQuote.execute({ symbol: 'NVDA' }, { messages: [], toolCallId: 'test' })

        expect(alpacaClient.getLastTrade).toHaveBeenCalledWith('NVDA')
        expect(result).toMatchObject({ symbol: 'NVDA', price: 195.5 })
    })

    describe('placeOrder validation', () => {
        it('rejects limit order without limitPrice', async () => {
            const deps = makeDeps()
            const { placeOrder } = createTradingAgentTools(deps)

            const result = await placeOrder.execute(
                { symbol: 'AAPL', side: 'buy', qty: 10, type: 'limit', reasoning: 'test' },
                { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal },
            )

            expect((result as { error: string }).error).toContain('limitPrice')
        })

        it('rejects stop order without stopPrice', async () => {
            const deps = makeDeps()
            const { placeOrder } = createTradingAgentTools(deps)

            const result = await placeOrder.execute(
                { symbol: 'AAPL', side: 'buy', qty: 10, type: 'stop', reasoning: 'test' },
                { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal },
            )

            expect((result as { error: string }).error).toContain('stopPrice')
        })

        it('rejects stop_limit without both prices', async () => {
            const deps = makeDeps()
            const { placeOrder } = createTradingAgentTools(deps)

            const result = await placeOrder.execute(
                { symbol: 'AAPL', side: 'buy', qty: 10, type: 'stop_limit', reasoning: 'test' },
                { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal },
            )

            expect((result as { error: string }).error).toContain('limitPrice')
        })

        it('rejects trailing_stop without trailPercent', async () => {
            const deps = makeDeps()
            const { placeOrder } = createTradingAgentTools(deps)

            const result = await placeOrder.execute(
                { symbol: 'AAPL', side: 'buy', qty: 10, type: 'trailing_stop', reasoning: 'test' },
                { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal },
            )

            expect((result as { error: string }).error).toContain('trailPercent')
        })

        it('accepts limit order with limitPrice', async () => {
            const alpacaClient = makeAlpacaClient()
            const db = makeDb()
            const deps = makeDeps({ alpacaClient, db: db as unknown as TradingAgentDeps['db'] })
            const { placeOrder } = createTradingAgentTools(deps)

            const result = await placeOrder.execute(
                { symbol: 'AAPL', side: 'buy', qty: 10, type: 'limit', limitPrice: 150, reasoning: 'test' },
                { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal },
            )

            expect(result).toMatchObject({ success: true })
        })
    })

    it('getTradeHistory fetches ALL orders and runs FIFO P&L before slicing', async () => {
        const now = new Date()
        const mockOrders = Array.from({ length: 5 }, (_, i) => ({
            id: `o${i}`,
            alpacaOrderId: `alp${i}`,
            symbol: 'AAPL',
            side: i % 2 === 0 ? 'buy' : 'sell',
            qty: 10,
            type: 'market',
            status: 'filled',
            filledAvgPrice: 150 + i,
            filledAt: now,
            reasoning: `reason ${i}`,
            createdAt: new Date(now.getTime() + i * 1000),
            limitPrice: null,
            stopPrice: null,
            trailPercent: null,
            timeInForce: 'day',
            updatedAt: now,
        }))

        const db = makeDb()
        db.order.findMany = mock(async () => mockOrders as unknown as Awaited<ReturnType<typeof db.order.findMany>>)

        const deps = makeDeps({ db: db as unknown as TradingAgentDeps['db'] })
        const { getTradeHistory } = createTradingAgentTools(deps)

        const result = await getTradeHistory.execute(
            { limit: 3 },
            { messages: [], toolCallId: 'test' },
        )

        // DB should be called without `take` limit (all orders fetched)
        expect(db.order.findMany).toHaveBeenCalledTimes(1)
        const callArgs = db.order.findMany.mock.calls[0][0] as Record<string, unknown>
        expect(callArgs).not.toHaveProperty('take')

        // Output limited to 3 but total reflects full count
        expect((result as { orders: unknown[]; total: number }).orders.length).toBe(3)
        expect((result as { orders: unknown[]; total: number }).total).toBe(5)
    })
})
