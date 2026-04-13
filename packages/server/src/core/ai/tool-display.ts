/**
 * Tool display utilities — pure logic, no React.
 *
 * Provides human-readable Chinese labels for tool invocations (loading state)
 * and one-line summaries for tool results (completion state).
 */

import { formatCurrency, formatPE, formatPercent } from '@flux/shared'

// ─── Type-safe helpers ───

type InputRecord = Record<string, unknown>

function getSymbol(input: unknown): string | undefined {
    if (input && typeof input === 'object' && 'symbol' in input) {
        const val = (input as InputRecord).symbol
        if (typeof val === 'string') return val
    }
    return undefined
}

function getString(input: unknown, key: string): string | undefined {
    if (input && typeof input === 'object' && key in input) {
        const val = (input as InputRecord)[key]
        if (typeof val === 'string') return val
    }
    return undefined
}

function getNumber(input: unknown, key: string): number | undefined {
    if (input && typeof input === 'object' && key in input) {
        const val = (input as InputRecord)[key]
        if (typeof val === 'number') return val
    }
    return undefined
}

function extractHostname(url: string): string {
    try {
        return new URL(url).hostname
    } catch {
        return url
    }
}

// ─── Loading labels ───

const LOADING_LABELS: Record<string, (input?: unknown) => string> = {
    getQuote: (input) => {
        const s = getSymbol(input)
        return s ? `查询 ${s} 报价` : '查询报价'
    },
    getCompanyInfo: (input) => {
        const s = getSymbol(input)
        return s ? `获取 ${s} 公司信息` : '获取公司信息'
    },
    getNews: (input) => {
        const s = getSymbol(input)
        return s ? `搜索 ${s} 新闻` : '搜索新闻'
    },
    getHistory: (input) => {
        const s = getSymbol(input)
        const days = getNumber(input, 'days')
        if (s && days) return `获取 ${s} 近 ${days} 天历史`
        if (s) return `获取 ${s} 历史数据`
        return '获取历史数据'
    },
    calculateIndicators: (input) => {
        const s = getSymbol(input)
        return s ? `计算 ${s} 技术指标` : '计算技术指标'
    },
    searchStock: (input) => {
        const q = getString(input, 'query')
        return q ? `搜索 "${q}"` : '搜索股票'
    },
    update_core_memory: (input) => {
        const slot = getString(input, 'slot')
        return slot ? `更新 ${slot} 记忆` : '更新记忆'
    },
    save_lesson: () => '记录教训',
    read_history: (input) => {
        const slot = getString(input, 'slot')
        return slot ? `回顾 ${slot} 历史` : '回顾历史记录'
    },
    webSearch: (input) => {
        const q = getString(input, 'query')
        return q ? `搜索 "${q}"` : '搜索互联网'
    },
    webFetch: (input) => {
        const url = getString(input, 'url')
        return url ? `阅读 ${extractHostname(url)}` : '阅读网页'
    },
    display_rating_card: () => '生成评级卡片',
    display_comparison_table: () => '生成对比表格',
    display_signal_badges: () => '生成技术信号',
}

/**
 * Returns a Chinese loading label for a tool invocation.
 */
export function getLoadingLabel(toolName: string, input?: unknown): string {
    const fn = LOADING_LABELS[toolName]
    if (fn) return fn(input)
    return '处理'
}

// ─── Completion summaries ───

const TOOLS_RETURNING_NULL = new Set([
    'webSearch',
    'display_rating_card',
    'display_comparison_table',
    'display_signal_badges',
])

function hasError(output: unknown): string | null {
    if (output && typeof output === 'object' && 'error' in output) {
        const err = (output as InputRecord).error
        if (typeof err === 'string') {
            const truncated = err.length > 50 ? `${err.slice(0, 50)}...` : err
            return `失败: ${truncated}`
        }
    }
    return null
}

function countArray(output: unknown): number | null {
    if (Array.isArray(output)) return output.length
    return null
}

const COMPLETION_HANDLERS: Record<string, (output: unknown) => string | null> =
    {
        getQuote: (output) => {
            if (!output || typeof output !== 'object') return null
            const o = output as InputRecord
            const price = typeof o.price === 'number' ? o.price : undefined
            const change = typeof o.change === 'number' ? o.change : undefined
            if (price !== undefined && change !== undefined) {
                return `${formatCurrency(price)} (${formatPercent(change)})`
            }
            if (price !== undefined) return formatCurrency(price)
            return null
        },
        getCompanyInfo: (output) => {
            if (!output || typeof output !== 'object') return null
            const o = output as InputRecord
            const name = typeof o.name === 'string' ? o.name : undefined
            const pe = typeof o.pe === 'number' ? o.pe : undefined
            if (name && pe !== undefined) return `${name} · PE ${formatPE(pe)}`
            if (name) return name
            return null
        },
        getNews: (output) => {
            const len = countArray(output)
            if (len !== null) return `找到 ${len} 条新闻`
            return null
        },
        getHistory: (output) => {
            const len = countArray(output)
            if (len !== null) return `已获取 ${len} 天历史数据`
            return null
        },
        calculateIndicators: (output) => {
            if (!output || typeof output !== 'object') return null
            const o = output as InputRecord
            const parts: string[] = []
            if (typeof o.rsi === 'number') {
                parts.push(`RSI ${Math.round(o.rsi)}`)
            }
            if (o.macd && typeof o.macd === 'object') {
                const macd = o.macd as InputRecord
                if (typeof macd.crossover === 'string') {
                    const label =
                        macd.crossover === 'golden'
                            ? '金叉'
                            : macd.crossover === 'death'
                              ? '死叉'
                              : null
                    if (label) parts.push(`MACD ${label}`)
                }
            }
            return parts.length > 0 ? parts.join(' · ') : null
        },
        searchStock: (output) => {
            const len = countArray(output)
            if (len !== null) return `找到 ${len} 个匹配`
            return null
        },
        update_core_memory: (output) => {
            if (output && typeof output === 'object' && 'message' in output) {
                const msg = (output as InputRecord).message
                if (typeof msg === 'string') return msg
            }
            return '已更新记忆'
        },
        save_lesson: () => '已记录教训',
        read_history: (output) => {
            if (output && typeof output === 'object' && 'versions' in output) {
                const versions = (output as InputRecord).versions
                if (Array.isArray(versions))
                    return `找到 ${versions.length} 条历史`
            }
            return null
        },
        webFetch: (output) => {
            if (output && typeof output === 'object' && 'url' in output) {
                const url = (output as InputRecord).url
                if (typeof url === 'string')
                    return `已阅读 ${extractHostname(url)}`
            }
            return null
        },
    }

/**
 * Returns a one-line Chinese summary for a tool result, or null
 * if the tool has its own display component (e.g. webSearch, display_*).
 */
export function getCompletionSummary(
    toolName: string,
    output?: unknown,
): string | null {
    if (output === undefined || output === null) return null

    // Tools that always return null (have their own UI)
    if (TOOLS_RETURNING_NULL.has(toolName)) return null

    // Error check first
    const errorMsg = hasError(output)
    if (errorMsg) return errorMsg

    const handler = COMPLETION_HANDLERS[toolName]
    if (handler) return handler(output)

    return null
}
