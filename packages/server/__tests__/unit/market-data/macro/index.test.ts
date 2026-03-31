import { describe, expect, mock, test, beforeEach } from 'bun:test'
import {
    createMacroService,
    findVixFromMacro,
    VIX_DISPLAY_NAME,
    type MacroService,
} from '@/core/market-data/macro/index'
import type { Quote } from '@/core/market-data/common/types'
import type { YahooFinanceClient } from '@/core/market-data/common/yahoo-client'
import type { FinnhubClient } from '@/core/market-data/common/finnhub-client'

function makeQuote(symbol: string, price: number, change: number): Quote {
    return { symbol, price, change, volume: 1000, timestamp: new Date() }
}

function createMockYahoo(): YahooFinanceClient {
    return {
        getQuote: mock(async (s: string) => {
            const quotes: Record<string, Quote> = {
                SPY: makeQuote('SPY', 520.5, 0.8),
                QQQ: makeQuote('QQQ', 445.3, 1.2),
                '^TNX': makeQuote('^TNX', 4.35, -0.05),
                '^VIX': makeQuote('^VIX', 15.2, -2.3),
            }
            const q = quotes[s]
            if (!q) throw new Error(`Unknown symbol: ${s}`)
            return q
        }),
        getBatchQuotes: mock(async () => new Map()),
        getDailyHistory: mock(async () => []),
        getCompanyOverview: mock(async (s: string) => ({
            symbol: s,
            name: s,
        })),
        search: mock(async () => ({ quotes: [] })),
    } as unknown as YahooFinanceClient
}

function createMockFinnhub(): FinnhubClient {
    return {
        getQuote: mock(async (s: string) =>
            makeQuote(s, 100, 0.5),
        ),
        getDailyHistory: mock(async () => []),
        getCompanyOverview: mock(async (s: string) => ({
            symbol: s,
            name: s,
        })),
        getCompanyNews: mock(async () => []),
    } as unknown as FinnhubClient
}

describe('MacroService', () => {
    let yahoo: ReturnType<typeof createMockYahoo>
    let finnhub: ReturnType<typeof createMockFinnhub>
    let service: MacroService

    beforeEach(() => {
        yahoo = createMockYahoo()
        finnhub = createMockFinnhub()
        service = createMacroService({ yahoo, finnhub })
    })

    test('returns 4 macro indicators', async () => {
        const macro = await service.getMacro()
        expect(macro.length).toBe(4)
    })

    test('formats indicator names in Chinese', async () => {
        const macro = await service.getMacro()
        const names = macro.map((m) => m.sym)
        expect(names).toContain('标普500')
        expect(names).toContain('纳斯达克100')
        expect(names).toContain('十年美债')
        expect(names).toContain('恐慌指数')
    })

    test('formats TNX value with % suffix', async () => {
        const macro = await service.getMacro()
        const tnx = macro.find((m) => m.sym === '十年美债')
        expect(tnx?.val).toBe('4.35%')
    })

    test('formats regular values as decimal', async () => {
        const macro = await service.getMacro()
        const spy = macro.find((m) => m.sym === '标普500')
        expect(spy?.val).toBe('520.50')
    })

    test('formats change with sign prefix', async () => {
        const macro = await service.getMacro()
        const spy = macro.find((m) => m.sym === '标普500')
        expect(spy?.chg).toBe('+0.8%')
    })

    test('sets trend based on change direction', async () => {
        const macro = await service.getMacro()
        const spy = macro.find((m) => m.sym === '标普500')
        expect(spy?.trend).toBe('up')
        const vix = macro.find((m) => m.sym === '恐慌指数')
        expect(vix?.trend).toBe('down')
    })

    test('returns placeholder on individual indicator failure', async () => {
        ;(yahoo.getQuote as ReturnType<typeof mock>).mockImplementation(
            async (s: string) => {
                if (s === '^VIX') throw new Error('VIX failed')
                return makeQuote(s, 500, 1)
            },
        )
        ;(finnhub.getQuote as ReturnType<typeof mock>).mockImplementation(
            async (s: string) => {
                if (s === '^VIX') throw new Error('VIX failed')
                return makeQuote(s, 500, 1)
            },
        )
        // Rebuild service with new mocks
        service = createMacroService({ yahoo, finnhub })
        const macro = await service.getMacro()
        const vix = macro.find((m) => m.sym === '恐慌指数')
        expect(vix?.val).toBe('--')
        expect(vix?.chg).toBe('--')
    })

    test('caches results within TTL (5min)', async () => {
        await service.getMacro()
        await service.getMacro()
        // All 4 indicators fetched once = 4 calls total, not 8
        expect(yahoo.getQuote).toHaveBeenCalledTimes(4)
    })
})

describe('findVixFromMacro', () => {
    test('returns VIX indicator when present', () => {
        const indicators = [
            { sym: '标普500', val: '520.50' },
            { sym: VIX_DISPLAY_NAME, val: '15.20' },
        ]
        const vix = findVixFromMacro(indicators)
        expect(vix?.val).toBe('15.20')
    })

    test('returns undefined when VIX not present', () => {
        const indicators = [{ sym: '标普500', val: '520.50' }]
        expect(findVixFromMacro(indicators)).toBeUndefined()
    })
})
