import type { CreateOrderParams } from './alpaca-client'

// ─── Types ───

export interface GuardContext {
    readonly account: {
        readonly equity: number
        readonly cash: number
        readonly buyingPower: number
        readonly lastEquity: number
        readonly longMarketValue: number
    }
    readonly todayOrders: readonly OrderRecord[]
    readonly currentPrice: number
}

export interface OrderRecord {
    readonly symbol: string
    readonly side: string
    readonly qty: number
    readonly status: string
    readonly filledQty: number | null
    readonly filledAvgPrice: number | null
    readonly createdAt: Date
}

export interface GuardResult {
    readonly passed: boolean
    readonly reason?: string
}

export interface GuardConfig {
    readonly maxOrderAmount: number
    readonly cooldownMinutes: number
    readonly maxDailyLoss: number
}

// ─── Defaults ───

const DEFAULT_CONFIG: GuardConfig = {
    maxOrderAmount: 10_000,
    cooldownMinutes: 5,
    maxDailyLoss: 5_000,
}

function loadConfig(): GuardConfig {
    return {
        maxOrderAmount:
            process.env.GUARD_MAX_ORDER_AMOUNT != null
                ? Number(process.env.GUARD_MAX_ORDER_AMOUNT)
                : DEFAULT_CONFIG.maxOrderAmount,
        cooldownMinutes:
            process.env.GUARD_COOLDOWN_MINUTES != null
                ? Number(process.env.GUARD_COOLDOWN_MINUTES)
                : DEFAULT_CONFIG.cooldownMinutes,
        maxDailyLoss:
            process.env.GUARD_MAX_DAILY_LOSS != null
                ? Number(process.env.GUARD_MAX_DAILY_LOSS)
                : DEFAULT_CONFIG.maxDailyLoss,
    }
}

// ─── Rules ───

function checkMaxAmount(
    params: CreateOrderParams,
    context: GuardContext,
    config: GuardConfig,
): GuardResult {
    const amount = params.qty * context.currentPrice
    if (amount > config.maxOrderAmount) {
        return {
            passed: false,
            reason: `单笔金额 $${amount.toFixed(0)} 超过限制 $${config.maxOrderAmount}`,
        }
    }
    return { passed: true }
}

function checkCooldown(
    params: CreateOrderParams,
    context: GuardContext,
    config: GuardConfig,
): GuardResult {
    const cooldownMs = config.cooldownMinutes * 60 * 1000
    const now = Date.now()

    const recentSameSymbol = context.todayOrders.some(
        (o) =>
            o.symbol === params.symbol &&
            now - o.createdAt.getTime() < cooldownMs,
    )

    if (recentSameSymbol) {
        return {
            passed: false,
            reason: `${params.symbol} 处于冷却期（${config.cooldownMinutes} 分钟内已有交易）`,
        }
    }
    return { passed: true }
}

function checkDailyLoss(
    _params: CreateOrderParams,
    context: GuardContext,
    config: GuardConfig,
): GuardResult {
    const filledSells = context.todayOrders.filter(
        (o) =>
            o.side === 'sell' &&
            o.status === 'filled' &&
            o.filledAvgPrice != null,
    )

    const filledBuys = context.todayOrders.filter(
        (o) =>
            o.side === 'buy' &&
            o.status === 'filled' &&
            o.filledAvgPrice != null,
    )

    const sellTotal = filledSells.reduce(
        (sum, o) => sum + (o.filledQty ?? o.qty) * (o.filledAvgPrice ?? 0),
        0,
    )
    const buyTotal = filledBuys.reduce(
        (sum, o) => sum + (o.filledQty ?? o.qty) * (o.filledAvgPrice ?? 0),
        0,
    )

    const dailyPnL = sellTotal - buyTotal
    if (dailyPnL < -config.maxDailyLoss) {
        return {
            passed: false,
            reason: `今日已实现亏损 $${Math.abs(dailyPnL).toFixed(0)} 超过上限 $${config.maxDailyLoss}`,
        }
    }
    return { passed: true }
}

// ─── Main ───

const RULES = [checkMaxAmount, checkCooldown, checkDailyLoss]

export function checkGuards(
    params: CreateOrderParams,
    context: GuardContext,
    config?: GuardConfig,
): GuardResult {
    const resolvedConfig = config ?? loadConfig()

    for (const rule of RULES) {
        const result = rule(params, context, resolvedConfig)
        if (!result.passed) return result
    }

    return { passed: true }
}
