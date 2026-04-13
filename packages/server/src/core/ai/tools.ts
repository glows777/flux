/**
 * Phase 2: AI SDK Tool Definitions
 *
 * 7 data tools wrapping existing business logic for agent-mode chat.
 * 3 display tools for structured UI output (rating card, comparison table, signal badges).
 * All data tools use dependency injection for testability.
 * Display tools are pure pass-through (execute returns params).
 */

import type { NewsItem } from '@flux/shared'
import { tool } from 'ai'
import { z } from 'zod'
import type { CompanyOverview, HistoryPoint, Quote } from '@/core/market-data'
import { calculateIndicators } from './prompts'
import { withTimeout } from './timeout'

export const TOOL_TIMEOUTS = {
    getQuote: 8_000,
    getCompanyInfo: 8_000,
    getHistory: 10_000,
    calculateIndicators: 10_000,
    getNews: 10_000,
    searchStock: 8_000,
} as const

export interface ToolDeps {
    readonly getQuote: (symbol: string) => Promise<Quote>
    readonly getInfo: (symbol: string) => Promise<CompanyOverview>
    readonly getHistoryRaw: (
        symbol: string,
        days: number,
    ) => Promise<HistoryPoint[]>
    readonly getNews: (symbol: string, limit: number) => Promise<NewsItem[]>
    readonly searchStocks: (
        query: string,
    ) => Promise<{ symbol: string; name: string }[]>
}

export function createTools(deps: ToolDeps) {
    return {
        getQuote: tool({
            description: '获取指定股票的实时报价 (价格、涨跌幅、成交量)',
            inputSchema: z.object({
                symbol: z.string(),
            }),
            execute: async ({ symbol }) => {
                try {
                    const quote = await withTimeout(
                        deps.getQuote(symbol),
                        TOOL_TIMEOUTS.getQuote,
                        'getQuote',
                    )
                    return {
                        price: quote.price,
                        change: quote.change,
                        volume: quote.volume,
                    }
                } catch (error) {
                    return {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }
                }
            },
        }),

        getCompanyInfo: tool({
            description: '获取公司基本面信息 (市盈率、市值、每股收益、行业等)',
            inputSchema: z.object({
                symbol: z.string(),
            }),
            execute: async ({ symbol }) => {
                try {
                    const info = await withTimeout(
                        deps.getInfo(symbol),
                        TOOL_TIMEOUTS.getCompanyInfo,
                        'getCompanyInfo',
                    )
                    return {
                        name: info.name,
                        pe: info.pe,
                        marketCap: info.marketCap,
                        eps: info.eps,
                        dividendYield: info.dividendYield,
                        sector: info.sector,
                    }
                } catch (error) {
                    return {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }
                }
            },
        }),

        // getNews: tool({
        //     description: '搜索指定股票的近期新闻',
        //     inputSchema: z.object({
        //         symbol: z.string(),
        //         limit: z.number().optional().default(5),
        //     }),
        //     execute: async ({ symbol, limit = 5 }) => {
        //         try {
        //             const news = await withTimeout(
        //                 deps.getStockNews(symbol, limit),
        //                 TOOL_TIMEOUTS.getNews,
        //                 'getNews',
        //             )
        //             return news.map((n) => ({
        //                 title: n.title,
        //                 source: n.source,
        //                 time: n.time,
        //                 url: n.url,
        //             }))
        //         } catch (error) {
        //             return {
        //                 error:
        //                     error instanceof Error
        //                         ? error.message
        //                         : String(error),
        //             }
        //         }
        //     },
        // }),

        getHistory: tool({
            description: '获取指定股票的历史价格数据',
            inputSchema: z.object({
                symbol: z.string(),
                days: z.number().min(7).max(365),
            }),
            execute: async ({ symbol, days }) => {
                try {
                    const history = await withTimeout(
                        deps.getHistoryRaw(symbol, days),
                        TOOL_TIMEOUTS.getHistory,
                        'getHistory',
                    )
                    return history.map((h) => ({
                        date:
                            h.date instanceof Date
                                ? h.date.toISOString().slice(0, 10)
                                : String(h.date),
                        close: h.close,
                    }))
                } catch (error) {
                    return {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }
                }
            },
        }),

        calculateIndicators: tool({
            description:
                '计算指定股票的增强技术指标 (MA20/MA50/MA200 均线、RSI、MACD、支撑阻力、量比)',
            inputSchema: z.object({
                symbol: z.string(),
            }),
            execute: async ({ symbol }) => {
                try {
                    const history = await withTimeout(
                        deps.getHistoryRaw(symbol, 200),
                        TOOL_TIMEOUTS.calculateIndicators,
                        'calculateIndicators',
                    )
                    return calculateIndicators(history)
                } catch (error) {
                    return {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }
                }
            },
        }),

        searchStock: tool({
            description: '按名称或代码搜索股票',
            inputSchema: z.object({
                query: z.string(),
            }),
            execute: async ({ query }) => {
                try {
                    return await withTimeout(
                        deps.searchStocks(query),
                        TOOL_TIMEOUTS.searchStock,
                        'searchStock',
                    )
                } catch (error) {
                    return {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }
                }
            },
        }),

        // ─── Display Tools (pure pass-through, no side effects) ───

        display_rating_card: tool({
            description:
                '展示投资评级卡片。先用 getQuote/getCompanyInfo 获取数据后，综合分析再调用此工具展示评级结论。',
            inputSchema: z.object({
                symbol: z.string(),
                rating: z.enum(['强买', '买入', '持有', '卖出', '强卖']),
                confidence: z.number().min(0).max(100).describe('置信度百分比'),
                targetPrice: z.number().optional().describe('目标价'),
                currentPrice: z.number().describe('当前价格'),
                summary: z.string().describe('一句话评级理由'),
                keyFactors: z.array(z.string()).max(5).describe('关键支撑因素'),
            }),
            execute: async (params) => params,
        }),

        display_comparison_table: tool({
            description:
                '展示多只股票的对比表格。先用 getCompanyInfo 获取各股票数据后，再调用此工具展示对比。',
            inputSchema: z.object({
                title: z
                    .string()
                    .optional()
                    .describe('表格标题，如"NVDA vs AMD 核心指标对比"'),
                rows: z.array(
                    z.object({
                        metric: z
                            .string()
                            .describe('指标名称，如"市盈率"、"总市值"'),
                        values: z.array(
                            z.object({
                                symbol: z.string(),
                                value: z
                                    .string()
                                    .describe(
                                        '格式化后的值，如"55.2x"、"$3.2T"',
                                    ),
                                highlight: z
                                    .enum(['positive', 'negative', 'neutral'])
                                    .optional(),
                            }),
                        ),
                    }),
                ),
            }),
            execute: async (params) => params,
        }),

        display_signal_badges: tool({
            description:
                '展示技术分析信号徽章列表。先用 getHistory + calculateIndicators 获取技术数据后，再调用此工具展示信号。',
            inputSchema: z.object({
                symbol: z.string(),
                signals: z.array(
                    z.object({
                        name: z
                            .string()
                            .describe('信号名称，如"RSI 超卖"、"MA20 金叉"'),
                        type: z.enum(['bullish', 'bearish', 'neutral']),
                        strength: z.enum(['strong', 'moderate', 'weak']),
                        detail: z.string().optional().describe('补充说明'),
                    }),
                ),
                overallBias: z
                    .enum(['bullish', 'bearish', 'neutral'])
                    .describe('综合技术面偏向'),
            }),
            execute: async (params) => params,
        }),
    }
}
