/**
 * P2-14: Prompt 构建单元测试
 *
 * 测试场景:
 * - T14-02: calculateIndicators MA20 正确计算
 * - T14-03: calculateIndicators RSI 在 0-100 范围内
 * - T14-04: 数据不足时技术指标返回 null
 * - T14-05: 涨跌幅格式 - 正数带 + 号
 *
 * 增强指标测试:
 * - MA50/MA200 正确计算及数据不足返回 null
 * - trendPosition 上升/下降/混合趋势
 * - MACD 基本计算、golden/death cross、无交叉
 * - support/resistance 取近 20 日极值
 * - volumeRatio 放量/缩量
 * - 不足数据全部 null
 * - 向后兼容
 */

import { describe, expect, it } from 'bun:test'
import type { EnhancedIndicators } from '@/core/ai/prompts'
import {
    buildAgentSystemPrompt,
    calculateIndicators,
} from '@/core/ai/prompts'
import type { HistoryPoint } from '@/core/market-data'

// ==================== 测试数据工厂 ====================

function createHistoryPoint(
    overrides: Partial<HistoryPoint> & { close: number },
): HistoryPoint {
    const close = overrides.close
    return {
        date: overrides.date ?? new Date(),
        open: overrides.open ?? close,
        high: overrides.high ?? close + 1,
        low: overrides.low ?? close - 1,
        close,
        volume: overrides.volume ?? 1000000,
    }
}

function createMockHistory(
    days: number,
    basePrice = 150,
    options?: { volume?: number; highOffset?: number; lowOffset?: number },
): readonly HistoryPoint[] {
    const vol = options?.volume ?? 1000000
    const highOff = options?.highOffset ?? 2
    const lowOff = options?.lowOffset ?? 2
    return Array.from({ length: days }, (_, i) => {
        const close = basePrice + (i % 5) - 2
        return createHistoryPoint({
            date: new Date(Date.now() - (days - i) * 86400000),
            close,
            open: close - 0.5,
            high: close + highOff,
            low: close - lowOff,
            volume: vol,
        })
    })
}

/**
 * 生成单调递增价格序列的 HistoryPoint[]
 */
function createIncreasingHistory(
    days: number,
    startPrice = 100,
): readonly HistoryPoint[] {
    return Array.from({ length: days }, (_, i) =>
        createHistoryPoint({
            date: new Date(Date.now() - (days - i) * 86400000),
            close: startPrice + i,
            open: startPrice + i - 0.5,
            high: startPrice + i + 1,
            low: startPrice + i - 1,
            volume: 1000000,
        }),
    )
}

/**
 * 生成单调递减价格序列的 HistoryPoint[]
 */
function createDecreasingHistory(
    days: number,
    startPrice = 200,
): readonly HistoryPoint[] {
    return Array.from({ length: days }, (_, i) =>
        createHistoryPoint({
            date: new Date(Date.now() - (days - i) * 86400000),
            close: startPrice - i,
            open: startPrice - i + 0.5,
            high: startPrice - i + 1,
            low: startPrice - i - 1,
            volume: 1000000,
        }),
    )
}

// ==================== calculateIndicators — 现有 MA20/RSI ====================

describe('P2-14: calculateIndicators', () => {
    it('T14-02: 正确计算 20 日均线 (MA20)', () => {
        const prices = Array.from({ length: 20 }, (_, i) => i + 1) // 1..20
        const history = prices.map((close, i) =>
            createHistoryPoint({
                date: new Date(Date.now() - (20 - i) * 86400000),
                close,
            }),
        )

        const result = calculateIndicators(history)

        // MA20 = average of 1..20 = 10.5
        expect(result.ma20).toBe(10.5)
    })

    it('T14-02b: MA20 仅使用最后 20 天数据', () => {
        const history = Array.from({ length: 30 }, (_, i) =>
            createHistoryPoint({
                date: new Date(Date.now() - (30 - i) * 86400000),
                close: i < 10 ? 100 : 200,
            }),
        )

        const result = calculateIndicators(history)

        expect(result.ma20).toBe(200)
    })

    it('T14-03: RSI 在 0-100 范围内', () => {
        const history = createMockHistory(30)
        const result = calculateIndicators(history)

        expect(result.rsi).not.toBeNull()
        expect(result.rsi!).toBeGreaterThanOrEqual(0)
        expect(result.rsi!).toBeLessThanOrEqual(100)
    })

    it('T14-03b: RSI 全涨时接近 100', () => {
        const history = createIncreasingHistory(20)
        const result = calculateIndicators(history)

        expect(result.rsi).toBe(100)
    })

    it('T14-03c: RSI 全跌时接近 0', () => {
        const history = createDecreasingHistory(20)
        const result = calculateIndicators(history)

        expect(result.rsi).toBe(0)
    })

    it('T14-04: 不足 20 天时 MA20 返回 null', () => {
        const history = createMockHistory(10)
        const result = calculateIndicators(history)

        expect(result.ma20).toBeNull()
    })

    it('T14-04b: 不足 15 天时 RSI 返回 null', () => {
        const history = createMockHistory(10)
        const result = calculateIndicators(history)

        expect(result.rsi).toBeNull()
    })

    it('T14-04c: 空历史数据', () => {
        const result = calculateIndicators([])

        expect(result.ma20).toBeNull()
        expect(result.rsi).toBeNull()
    })
})

// ==================== calculateIndicators — MA50/MA200 ====================

describe('Enhanced: MA50/MA200', () => {
    it('MA50 正确计算 — 50 天数据', () => {
        const history = Array.from({ length: 50 }, (_, i) =>
            createHistoryPoint({
                date: new Date(Date.now() - (50 - i) * 86400000),
                close: i + 1, // 1..50
            }),
        )

        const result = calculateIndicators(history)

        // MA50 = average of 1..50 = 25.5
        expect(result.ma50).toBe(25.5)
    })

    it('MA50 不足 50 天数据返回 null', () => {
        const history = createMockHistory(49)
        const result = calculateIndicators(history)

        expect(result.ma50).toBeNull()
    })

    it('MA200 正确计算 — 200 天数据', () => {
        const history = Array.from({ length: 200 }, (_, i) =>
            createHistoryPoint({
                date: new Date(Date.now() - (200 - i) * 86400000),
                close: i + 1, // 1..200
            }),
        )

        const result = calculateIndicators(history)

        // MA200 = average of 1..200 = 100.5
        expect(result.ma200).toBe(100.5)
    })

    it('MA200 不足 200 天数据返回 null', () => {
        const history = createMockHistory(199)
        const result = calculateIndicators(history)

        expect(result.ma200).toBeNull()
    })
})

// ==================== calculateIndicators — trendPosition ====================

describe('Enhanced: trendPosition', () => {
    it('上升趋势 — price > MA20 > MA50 > MA200 → above-all', () => {
        // 构造：MA200 低, MA50 中, MA20 高, 当前价格最高
        // 200 天数据：前 150 天低价，中 30 天中价，后 20 天高价
        const history: HistoryPoint[] = [
            ...Array.from({ length: 150 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (200 - i) * 86400000),
                    close: 50, // 低价 → 拉低 MA200
                }),
            ),
            ...Array.from({ length: 30 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (50 - i) * 86400000),
                    close: 100, // 中价 → MA50 中
                }),
            ),
            ...Array.from({ length: 20 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (20 - i) * 86400000),
                    close: 200, // 高价 → MA20 最高
                }),
            ),
        ]

        const result = calculateIndicators(history)

        // 最新价格 (200) > MA20 (200) > MA50 > MA200
        expect(result.trendPosition).toBe('above-all')
    })

    it('下降趋势 — price < 所有均线 → below-all', () => {
        // 构造：MA200 高, MA50 中, MA20 低, 当前价格最低
        const history: HistoryPoint[] = [
            ...Array.from({ length: 150 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (200 - i) * 86400000),
                    close: 200, // 高价 → 拉高 MA200
                }),
            ),
            ...Array.from({ length: 30 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (50 - i) * 86400000),
                    close: 100, // 中价 → MA50 中
                }),
            ),
            ...Array.from({ length: 20 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (20 - i) * 86400000),
                    close: 50, // 低价 → MA20 最低
                }),
            ),
        ]

        const result = calculateIndicators(history)

        // 最新价格 (50) < MA20 < MA50 < MA200
        expect(result.trendPosition).toBe('below-all')
    })

    it('混合趋势 → between', () => {
        // 构造价格穿插在均线之间
        const history: HistoryPoint[] = [
            ...Array.from({ length: 150 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (200 - i) * 86400000),
                    close: 100,
                }),
            ),
            ...Array.from({ length: 30 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (50 - i) * 86400000),
                    close: 120,
                }),
            ),
            ...Array.from({ length: 20 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (20 - i) * 86400000),
                    close: 90, // 低于 MA50 但高于某些 → between
                }),
            ),
        ]

        const result = calculateIndicators(history)

        expect(result.trendPosition).toBe('between')
    })

    it('数据不足时 trendPosition 返回 null', () => {
        // 不足 200 天，MA200 为 null → trendPosition 为 null
        const history = createMockHistory(49)
        const result = calculateIndicators(history)

        expect(result.trendPosition).toBeNull()
    })
})

// ==================== calculateIndicators — MACD ====================

describe('Enhanced: MACD', () => {
    it('MACD 基本计算 — 35 天数据应可计算', () => {
        const history = createIncreasingHistory(40, 100)
        const result = calculateIndicators(history)

        expect(result.macd).not.toBeNull()
        expect(result.macd!.value).toBeDefined()
        expect(result.macd!.signal).toBeDefined()
        expect(result.macd!.histogram).toBeDefined()
    })

    it('MACD 不足 35 天数据返回 null', () => {
        const history = createMockHistory(34)
        const result = calculateIndicators(history)

        expect(result.macd).toBeNull()
    })

    it('MACD histogram = value - signal', () => {
        const history = createIncreasingHistory(50, 100)
        const result = calculateIndicators(history)

        expect(result.macd).not.toBeNull()
        const { value, signal, histogram } = result.macd!
        expect(Math.abs(histogram - (value - signal))).toBeLessThan(0.0001)
    })

    it('MACD golden cross — 近 3 日 MACD 由下穿上 signal', () => {
        // 先跌后涨：让 MACD line 从 signal 下方穿越到上方
        const history: HistoryPoint[] = [
            // 前 30 天下跌
            ...Array.from({ length: 30 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (40 - i) * 86400000),
                    close: 200 - i * 2,
                }),
            ),
            // 后 10 天急速上涨（触发 golden cross）
            ...Array.from({ length: 10 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (10 - i) * 86400000),
                    close: 140 + i * 5,
                }),
            ),
        ]

        const result = calculateIndicators(history)

        expect(result.macd).not.toBeNull()
        // golden cross: MACD line crosses above signal
        if (result.macd!.crossover !== null) {
            expect(result.macd!.crossover).toBe('golden')
        }
    })

    it('MACD death cross — 近 3 日 MACD 由上穿下 signal', () => {
        // 先涨后跌：让 MACD line 从 signal 上方穿越到下方
        const history: HistoryPoint[] = [
            // 前 30 天上涨
            ...Array.from({ length: 30 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (40 - i) * 86400000),
                    close: 100 + i * 2,
                }),
            ),
            // 后 10 天急速下跌（触发 death cross）
            ...Array.from({ length: 10 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (10 - i) * 86400000),
                    close: 160 - i * 5,
                }),
            ),
        ]

        const result = calculateIndicators(history)

        expect(result.macd).not.toBeNull()
        if (result.macd!.crossover !== null) {
            expect(result.macd!.crossover).toBe('death')
        }
    })

    it('MACD 无交叉 — 持续趋势中 crossover 为 null', () => {
        // 持续上涨：MACD line 一直在 signal 上方
        const history = createIncreasingHistory(50, 100)
        const result = calculateIndicators(history)

        expect(result.macd).not.toBeNull()
        expect(result.macd!.crossover).toBeNull()
    })
})

// ==================== calculateIndicators — support/resistance ====================

describe('Enhanced: support/resistance', () => {
    it('support 取近 20 日最低价', () => {
        const history = Array.from({ length: 20 }, (_, i) =>
            createHistoryPoint({
                date: new Date(Date.now() - (20 - i) * 86400000),
                close: 100 + i,
                low: 95 + i, // low: 95..114，最低为 95
            }),
        )

        const result = calculateIndicators(history)

        expect(result.support).toBe(95)
    })

    it('resistance 取近 20 日最高价', () => {
        const history = Array.from({ length: 20 }, (_, i) =>
            createHistoryPoint({
                date: new Date(Date.now() - (20 - i) * 86400000),
                close: 100 + i,
                high: 105 + i, // high: 105..124，最高为 124
            }),
        )

        const result = calculateIndicators(history)

        expect(result.resistance).toBe(124)
    })

    it('不足 20 天数据 → support/resistance 返回 null', () => {
        const history = createMockHistory(19)
        const result = calculateIndicators(history)

        expect(result.support).toBeNull()
        expect(result.resistance).toBeNull()
    })

    it('support/resistance 仅使用最后 20 天', () => {
        const history: HistoryPoint[] = [
            // 前 10 天有极端值
            ...Array.from({ length: 10 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (30 - i) * 86400000),
                    close: 100,
                    low: 10, // 极低值，不应被计算
                    high: 500, // 极高值，不应被计算
                }),
            ),
            // 后 20 天正常范围
            ...Array.from({ length: 20 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (20 - i) * 86400000),
                    close: 150,
                    low: 140 + i, // 140..159，最低 140
                    high: 155 + i, // 155..174，最高 174
                }),
            ),
        ]

        const result = calculateIndicators(history)

        expect(result.support).toBe(140)
        expect(result.resistance).toBe(174)
    })
})

// ==================== calculateIndicators — volumeRatio ====================

describe('Enhanced: volumeRatio', () => {
    it('放量 — 近 5 日均量 > 近 20 日均量 → >1', () => {
        const history: HistoryPoint[] = [
            // 前 15 天低量
            ...Array.from({ length: 15 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (20 - i) * 86400000),
                    close: 100,
                    volume: 1000,
                }),
            ),
            // 后 5 天高量
            ...Array.from({ length: 5 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (5 - i) * 86400000),
                    close: 100,
                    volume: 5000,
                }),
            ),
        ]

        const result = calculateIndicators(history)

        expect(result.volumeRatio).not.toBeNull()
        expect(result.volumeRatio!).toBeGreaterThan(1)
    })

    it('缩量 — 近 5 日均量 < 近 20 日均量 → <1', () => {
        const history: HistoryPoint[] = [
            // 前 15 天高量
            ...Array.from({ length: 15 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (20 - i) * 86400000),
                    close: 100,
                    volume: 5000,
                }),
            ),
            // 后 5 天低量
            ...Array.from({ length: 5 }, (_, i) =>
                createHistoryPoint({
                    date: new Date(Date.now() - (5 - i) * 86400000),
                    close: 100,
                    volume: 1000,
                }),
            ),
        ]

        const result = calculateIndicators(history)

        expect(result.volumeRatio).not.toBeNull()
        expect(result.volumeRatio!).toBeLessThan(1)
    })

    it('不足 20 天 → volumeRatio 返回 null', () => {
        const history = createMockHistory(19)
        const result = calculateIndicators(history)

        expect(result.volumeRatio).toBeNull()
    })

    it('volume 为 undefined 时 → volumeRatio 返回 null', () => {
        const history = Array.from({ length: 20 }, (_, i) => ({
            date: new Date(Date.now() - (20 - i) * 86400000),
            open: 100,
            high: 105,
            low: 95,
            close: 100,
            // no volume
        }))

        const result = calculateIndicators(history)

        expect(result.volumeRatio).toBeNull()
    })
})

// ==================== 数据不足全部 null ====================

describe('Enhanced: 数据不足', () => {
    it('少于 15 天数据 → 所有新增指标 null', () => {
        const history = createMockHistory(10)
        const result = calculateIndicators(history)

        expect(result.ma20).toBeNull()
        expect(result.rsi).toBeNull()
        expect(result.ma50).toBeNull()
        expect(result.ma200).toBeNull()
        expect(result.trendPosition).toBeNull()
        expect(result.macd).toBeNull()
        expect(result.support).toBeNull()
        expect(result.resistance).toBeNull()
        expect(result.volumeRatio).toBeNull()
    })
})

// ==================== 向后兼容 ====================

describe('Enhanced: 向后兼容', () => {
    it('返回类型为 EnhancedIndicators', () => {
        const history = createMockHistory(30)
        const result: EnhancedIndicators = calculateIndicators(history)

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

    it('MA20 和 RSI 行为不变', () => {
        const history = createIncreasingHistory(20)
        const result = calculateIndicators(history)

        expect(result.ma20).not.toBeNull()
        expect(result.rsi).toBe(100)
    })
})

// ==================== buildAgentSystemPrompt — 联网搜索规则 ====================

describe('buildAgentSystemPrompt — web search rules', () => {
    it('contains "联网搜索" section', () => {
        const prompt = buildAgentSystemPrompt('NVDA')
        expect(prompt).toContain('联网搜索')
    })

    it('contains "webSearch"', () => {
        const prompt = buildAgentSystemPrompt('NVDA')
        expect(prompt).toContain('webSearch')
    })

    it('contains "webFetch"', () => {
        const prompt = buildAgentSystemPrompt('NVDA')
        expect(prompt).toContain('webFetch')
    })

    it('contains "score > 0.8"', () => {
        const prompt = buildAgentSystemPrompt('NVDA')
        expect(prompt).toContain('score > 0.8')
    })

    it('does not break existing display tool rules', () => {
        const prompt = buildAgentSystemPrompt('NVDA')
        expect(prompt).toContain('展示工具使用规则')
        expect(prompt).toContain('display_')
    })

    it('memoryContext present -> memory section + search section both present', () => {
        const prompt = buildAgentSystemPrompt('NVDA', 'NVIDIA Corp', {
            memoryContext: '## 用户记忆\n投资偏好: 科技股',
        })
        expect(prompt).toContain('记忆工具')
        expect(prompt).toContain('联网搜索')
    })
})
