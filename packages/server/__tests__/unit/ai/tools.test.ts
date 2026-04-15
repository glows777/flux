/**
 * Phase 2: Tool Definitions Unit Tests
 *
 * Test scenarios:
 * - T02-01: createTools returns object with 7 data tools + 3 display tools (10 total)
 * - T02-02: getQuote tool calls deps.getQuote
 * - T02-03: getNews tool uses default limit=5
 * - T02-04: getHistory tool returns slim fields { date, close }
 * - T02-05: tool execute catches errors and returns { error }
 * - T02-06: calculateIndicators tool composes getHistory + calculateIndicators
 * - T02-08: searchStock tool uses deps.searchStocks
 * - T02-09: every tool has a description field
 *
 * Display tools:
 * - P2-T01: createTools 包含 display_rating_card 工具
 * - P2-T02: createTools 包含 display_comparison_table 工具
 * - P2-T03: createTools 包含 display_signal_badges 工具
 * - P2-T04: display_rating_card execute 直接返回参数
 * - P2-T05: display_comparison_table execute 直接返回参数
 * - P2-T06: display_signal_badges execute 直接返回参数
 * - P2-T07: 每个展示工具都包含 description 字段
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { createTools, type ToolDeps } from '@/core/ai/tools'

// ─── Mock deps factory ───

function createMockDeps(): ToolDeps {
    return {
        getQuote: mock(() =>
            Promise.resolve({
                symbol: 'AAPL',
                price: 150,
                change: 2.5,
                volume: 1000000,
                timestamp: new Date('2024-01-01'),
            }),
        ),
        getInfo: mock(() =>
            Promise.resolve({
                symbol: 'AAPL',
                name: 'Apple Inc.',
                pe: 28.5,
                marketCap: 3e12,
                eps: 6.15,
                dividendYield: 0.005,
                sector: 'Technology',
            }),
        ),
        getHistoryRaw: mock(() =>
            Promise.resolve(
                Array.from({ length: 30 }, (_, i) => ({
                    date: new Date(Date.now() - (30 - i) * 86400000),
                    open: 148 + i * 0.1,
                    high: 152 + i * 0.1,
                    low: 147 + i * 0.1,
                    close: 150 + i * 0.1,
                    volume: 1000000 + i * 1000,
                })),
            ),
        ),
        getNews: mock(() =>
            Promise.resolve([
                {
                    id: '1',
                    title: 'Apple launches new product',
                    source: 'Reuters',
                    time: '2024-01-01T00:00:00Z',
                    url: 'https://example.com/1',
                    sentiment: 'positive' as const,
                },
            ]),
        ),
        searchStocks: mock(() =>
            Promise.resolve([{ symbol: 'NVDA', name: 'NVIDIA Corporation' }]),
        ),
    }
}

// ─── Tests ───

describe('createTools', () => {
    let mockDeps: ToolDeps

    beforeEach(() => {
        mockDeps = createMockDeps()
    })

    it('T02-01: returns object with 5 data tools + 3 display tools (8 total)', () => {
        const tools = createTools(mockDeps)

        const expectedKeys = [
            'getQuote',
            'getCompanyInfo',
            'getHistory',
            'calculateIndicators',
            'searchStock',
            'display_rating_card',
            'display_comparison_table',
            'display_signal_badges',
        ]

        const toolKeys = Object.keys(tools)
        expect(toolKeys).toHaveLength(8)
        for (const key of expectedKeys) {
            expect(toolKeys).toContain(key)
        }
    })

    it('T02-02: getQuote tool calls deps.getQuote', async () => {
        const tools = createTools(mockDeps)

        const result = await tools.getQuote.execute(
            { symbol: 'AAPL' },
            {
                toolCallId: 'test',
                messages: [],
                abortSignal: undefined as unknown as AbortSignal,
            },
        )

        expect(mockDeps.getQuote).toHaveBeenCalledWith('AAPL')
        expect(result).toHaveProperty('price', 150)
        expect(result).toHaveProperty('change', 2.5)
    })

    // T02-03: getNews tool is temporarily disabled (commented out in tools.ts)

    it('T02-04: getHistory tool returns slim fields { date, close }', async () => {
        const tools = createTools(mockDeps)

        const result = await tools.getHistory.execute(
            { symbol: 'AAPL', days: 30 },
            {
                toolCallId: 'test',
                messages: [],
                abortSignal: undefined as unknown as AbortSignal,
            },
        )

        expect(Array.isArray(result)).toBe(true)
        const first = (result as { date: string; close: number }[])[0]
        expect(first).toHaveProperty('date')
        expect(first).toHaveProperty('close')
        expect(first).not.toHaveProperty('open')
        expect(first).not.toHaveProperty('high')
        expect(first).not.toHaveProperty('low')
        expect(first).not.toHaveProperty('volume')
    })

    it('T02-05: tool execute catches errors and returns { error }', async () => {
        mockDeps.getQuote = mock(() => Promise.reject(new Error('API failed')))
        const tools = createTools(mockDeps)

        const result = await tools.getQuote.execute(
            { symbol: 'AAPL' },
            {
                toolCallId: 'test',
                messages: [],
                abortSignal: undefined as unknown as AbortSignal,
            },
        )

        expect(result).toHaveProperty('error', 'API failed')
    })

    it('T02-06: calculateIndicators tool composes getHistory + calculateIndicators', async () => {
        const tools = createTools(mockDeps)

        const result = await tools.calculateIndicators.execute(
            { symbol: 'AAPL' },
            {
                toolCallId: 'test',
                messages: [],
                abortSignal: undefined as unknown as AbortSignal,
            },
        )

        expect(mockDeps.getHistoryRaw).toHaveBeenCalledWith('AAPL', 200)
        expect(result).toHaveProperty('ma20')
        expect(result).toHaveProperty('rsi')
        expect(result).toHaveProperty('ma50')
        expect(result).toHaveProperty('ma200')
        expect(result).toHaveProperty('trendPosition')
        expect(result).toHaveProperty('macd')
        expect(result).toHaveProperty('support')
        expect(result).toHaveProperty('resistance')
        expect(result).toHaveProperty('volumeRatio')
    })

    it('T02-08: searchStock tool uses deps.searchStocks', async () => {
        const tools = createTools(mockDeps)

        const result = await tools.searchStock.execute(
            { query: 'NVDA' },
            {
                toolCallId: 'test',
                messages: [],
                abortSignal: undefined as unknown as AbortSignal,
            },
        )

        expect(mockDeps.searchStocks).toHaveBeenCalledWith('NVDA')
        expect(Array.isArray(result)).toBe(true)
        expect((result as { symbol: string; name: string }[])[0]).toEqual({
            symbol: 'NVDA',
            name: 'NVIDIA Corporation',
        })
    })

    it('T02-09: every tool has a description field', () => {
        const tools = createTools(mockDeps)

        for (const [name, t] of Object.entries(tools)) {
            expect(
                t.description,
                `Tool "${name}" missing description`,
            ).toBeDefined()
            expect(typeof t.description).toBe('string')
            expect(t.description?.length).toBeGreaterThan(0)
        }
    })
})

// ─── Display Tools ───

describe('Display tools', () => {
    let mockDeps: ToolDeps

    beforeEach(() => {
        mockDeps = createMockDeps()
    })

    const execOpts = {
        toolCallId: 'test',
        messages: [] as never[],
        abortSignal: undefined as unknown as AbortSignal,
    }

    it('P2-T01: createTools 包含 display_rating_card 工具', () => {
        const tools = createTools(mockDeps)
        expect(Object.keys(tools)).toContain('display_rating_card')
    })

    it('P2-T02: createTools 包含 display_comparison_table 工具', () => {
        const tools = createTools(mockDeps)
        expect(Object.keys(tools)).toContain('display_comparison_table')
    })

    it('P2-T03: createTools 包含 display_signal_badges 工具', () => {
        const tools = createTools(mockDeps)
        expect(Object.keys(tools)).toContain('display_signal_badges')
    })

    it('P2-T04: display_rating_card execute 直接返回参数', async () => {
        const tools = createTools(mockDeps)
        const params = {
            symbol: 'NVDA',
            rating: '买入' as const,
            confidence: 85,
            targetPrice: 180,
            currentPrice: 150,
            summary: 'AI 需求持续增长，估值合理',
            keyFactors: ['数据中心收入增长', 'AI 芯片领先地位'],
        }

        const result = await tools.display_rating_card.execute(params, execOpts)

        expect(result).toEqual(params)
    })

    it('P2-T05: display_comparison_table execute 直接返回参数', async () => {
        const tools = createTools(mockDeps)
        const params = {
            title: 'NVDA vs AMD 核心指标对比',
            rows: [
                {
                    metric: '市盈率',
                    values: [
                        {
                            symbol: 'NVDA',
                            value: '55.2x',
                            highlight: 'neutral' as const,
                        },
                        {
                            symbol: 'AMD',
                            value: '45.1x',
                            highlight: 'positive' as const,
                        },
                    ],
                },
            ],
        }

        const result = await tools.display_comparison_table.execute(
            params,
            execOpts,
        )

        expect(result).toEqual(params)
    })

    it('P2-T06: display_signal_badges execute 直接返回参数', async () => {
        const tools = createTools(mockDeps)
        const params = {
            symbol: 'NVDA',
            signals: [
                {
                    name: 'RSI 超卖',
                    type: 'bullish' as const,
                    strength: 'strong' as const,
                    detail: 'RSI=25',
                },
                {
                    name: 'MA20 金叉',
                    type: 'bullish' as const,
                    strength: 'moderate' as const,
                },
            ],
            overallBias: 'bullish' as const,
        }

        const result = await tools.display_signal_badges.execute(
            params,
            execOpts,
        )

        expect(result).toEqual(params)
    })

    it('P2-T07: 每个展示工具都包含 description 字段', () => {
        const tools = createTools(mockDeps)
        const displayTools = [
            'display_rating_card',
            'display_comparison_table',
            'display_signal_badges',
        ] as const

        for (const name of displayTools) {
            const t = tools[name]
            expect(
                t.description,
                `Tool "${name}" missing description`,
            ).toBeDefined()
            expect(typeof t.description).toBe('string')
            expect(t.description?.length).toBeGreaterThan(0)
        }
    })
})
