import { describe, expect, mock, test } from 'bun:test'
import { tradingPlugin } from '../../../../src/core/ai/plugins/trading'

describe('tradingPlugin', () => {
    test('has name "trading"', () => {
        expect(
            tradingPlugin({ deps: { createTradingTools: mock(() => ({})) } })
                .name,
        ).toBe('trading')
    })

    test('contribute returns maxSteps override', async () => {
        const plugin = tradingPlugin({
            deps: { createTradingTools: mock(() => ({})) },
        })
        const ctx = {
            sessionId: 's1',
            channel: 'cron',
            mode: 'trigger' as const,
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        }

        const result = await plugin.contribute?.(ctx as never)
        expect(result?.params?.maxSteps).toBe(50)
    })

    test('provides trading instructions as a system segment', async () => {
        const plugin = tradingPlugin({
            deps: { createTradingTools: mock(() => ({})) },
        })

        const output = await plugin.contribute?.({
            sessionId: 's1',
            channel: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        } as never)

        expect(output?.segments?.[0].kind).toBe('system.instructions')
    })

    test('provides all trading tools', async () => {
        const mockCreate = mock(() => ({
            placeOrder: {},
            cancelOrder: {},
            closePosition: {},
            getPortfolio: {},
            getTradeHistory: {},
        }))
        const plugin = tradingPlugin({
            deps: { createTradingTools: mockCreate },
        })
        const output = await plugin.contribute?.({
            sessionId: 's1',
            channel: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        } as never)
        const names = output?.tools?.map((tool) => tool.name) ?? []
        expect(names).toContain('placeOrder')
        expect(names).toContain('getPortfolio')
        expect(names).toContain('getTradeHistory')
    })

    test('throws when deps.createTradingTools is not provided', () => {
        expect(() => tradingPlugin()).toThrow(
            'tradingPlugin requires deps.createTradingTools',
        )
    })
})
