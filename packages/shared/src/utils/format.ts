/**
 * Format utility functions for financial metrics display
 */

/**
 * 格式化货币 (美元)
 */
export function formatCurrency(value: number): string {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * 格式化带符号的货币 (美元, 正数加 +)
 */
export function formatSignedCurrency(value: number): string {
    const prefix = value >= 0 ? '+' : '-'
    return `${prefix}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number): string {
    const prefix = value >= 0 ? '+' : ''
    return `${prefix}${value.toFixed(2)}%`
}

/**
 * 格式化市值
 */
export function formatMarketCap(value?: number | null): string {
    if (value === undefined || value === null) return '--'

    if (value >= 1e12) {
        return `$${(value / 1e12).toFixed(2)}T`
    }
    if (value >= 1e9) {
        return `$${(value / 1e9).toFixed(2)}B`
    }
    if (value >= 1e6) {
        return `$${(value / 1e6).toFixed(2)}M`
    }
    return `$${value.toLocaleString()}`
}

/**
 * 格式化市盈率
 */
export function formatPE(value?: number | null): string {
    if (value === undefined || value === null) return '--'
    return value.toFixed(2)
}

/**
 * 格式化每股收益
 */
export function formatEPS(value?: number | null): string {
    if (value === undefined || value === null) return '--'
    return `$${value.toFixed(2)}`
}

/**
 * 格式化股息率
 */
export function formatDividendYield(value?: number | null): string {
    if (value === undefined || value === null) return '--'
    return `${(value * 100).toFixed(2)}%`
}

/**
 * 格式化大数字 (用于财务指标: revenue, FCF 等)
 * 支持 T/B/M 缩写, 负数前缀, null/undefined 返回 "--"
 */
export function formatLargeNumber(value?: number | null): string {
    if (value === undefined || value === null) return '--'
    if (value === 0) return '$0'

    const isNegative = value < 0
    const abs = Math.abs(value)
    const prefix = isNegative ? '-$' : '$'

    if (abs >= 1e12) return `${prefix}${(abs / 1e12).toFixed(2)}T`
    if (abs >= 1e9) return `${prefix}${(abs / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `${prefix}${(abs / 1e6).toFixed(2)}M`

    return `${prefix}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

/**
 * VIX 波动等级标签
 */
const VIX_LABEL_LOW = 15
const VIX_LABEL_HIGH = 25
const VIX_LABEL_EXTREME = 35

export function getVixLabel(vix: number): string {
    if (vix < VIX_LABEL_LOW) return '低波动状态'
    if (vix < VIX_LABEL_HIGH) return '中等波动'
    if (vix < VIX_LABEL_EXTREME) return '高波动状态'
    return '极端波动'
}

/**
 * ISO 时间字符串 → "MM/DD HH:mm" (Asia/Shanghai 时区)
 */
export function formatBriefTime(isoString: string): string {
    const date = new Date(isoString)
    const parts = new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Shanghai',
    }).formatToParts(date)
    const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? ''
    return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`
}

/**
 * 根据当前时段返回中文问候语
 */
export function getGreeting(): string {
    const hours = new Date().getHours()
    if (hours < 12) return '早上好'
    if (hours < 18) return '下午好'
    return '晚上好'
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * 将 ISO 时间字符串格式化为相对时间 (如 "3小时前", "2天前")
 * 超过 7 天则显示 MM/DD 格式
 */
export function formatRelativeTime(isoString: string): string {
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return isoString

    const diff = Date.now() - date.getTime()

    if (diff < MINUTE_MS) return '刚刚'
    if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}分钟前`
    if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}小时前`
    if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}天前`

    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}/${day}`
}
