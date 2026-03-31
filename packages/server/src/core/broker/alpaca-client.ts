/**
 * Alpaca Paper Trading Client
 *
 * Thin wrapper over @alpacahq/alpaca-trade-api SDK providing:
 * - Typed interfaces for account, position, and order data
 * - String→number conversion for all API fields
 * - Graceful degradation (returns null/[] on errors or missing config)
 * - Module-level singleton with reset support for testing
 */

import Alpaca from '@alpacahq/alpaca-trade-api'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AlpacaAccount {
    readonly equity: number
    readonly cash: number
    readonly buyingPower: number
    readonly lastEquity: number
    readonly longMarketValue: number
}

export interface AlpacaPosition {
    readonly symbol: string
    readonly qty: number
    readonly avgEntryPrice: number
    readonly currentPrice: number
    readonly marketValue: number
    readonly costBasis: number
    readonly unrealizedPl: number
    readonly unrealizedPlPc: number
    readonly changeToday: number
    readonly lastdayPrice: number
}

export interface AlpacaOrder {
    readonly id: string
    readonly symbol: string
    readonly qty: number
    readonly filledQty: number | null
    readonly side: 'buy' | 'sell'
    readonly type: string
    readonly status: string
    readonly filledAvgPrice: number | null
    readonly filledAt: string | null
    readonly createdAt: string
    readonly limitPrice: number | null
    readonly stopPrice: number | null
    readonly trailPercent: number | null
    readonly timeInForce: string | null
}

export interface AlpacaClientConfig {
    readonly keyId: string
    readonly secretKey: string
}

export interface CreateOrderParams {
    readonly symbol: string
    readonly side: 'buy' | 'sell'
    readonly qty: number
    readonly type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop'
    readonly limitPrice?: number
    readonly stopPrice?: number
    readonly trailPercent?: number
    readonly timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok'
}

export interface AlpacaClient {
    getAccount(): Promise<AlpacaAccount | null>
    getPositions(): Promise<AlpacaPosition[]>
    getPosition(symbol: string): Promise<AlpacaPosition | null>
    getOrders(params?: { status?: string; limit?: number }): Promise<AlpacaOrder[]>
    isConfigured(): boolean
    createOrder(params: CreateOrderParams): Promise<AlpacaOrder | null>
    cancelOrder(orderId: string): Promise<boolean>
    closePosition(symbol: string): Promise<AlpacaOrder | null>
    getLastTrade(symbol: string): Promise<{ price: number } | null>
}

// ─── Number Helpers ───────────────────────────────────────────────────────────

function parseNum(val: unknown): number {
    const n = parseFloat(String(val))
    return Number.isNaN(n) ? 0 : n
}

function parseNumOrNull(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null
    const n = parseFloat(String(val))
    return Number.isNaN(n) ? null : n
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapAccount(raw: Record<string, unknown>): AlpacaAccount {
    return {
        equity: parseNum(raw.equity),
        cash: parseNum(raw.cash),
        buyingPower: parseNum(raw.buying_power),
        lastEquity: parseNum(raw.last_equity),
        longMarketValue: parseNum(raw.long_market_value),
    }
}

function mapPosition(raw: Record<string, unknown>): AlpacaPosition {
    return {
        symbol: String(raw.symbol ?? ''),
        qty: parseNum(raw.qty),
        avgEntryPrice: parseNum(raw.avg_entry_price),
        currentPrice: parseNum(raw.current_price),
        marketValue: parseNum(raw.market_value),
        costBasis: parseNum(raw.cost_basis),
        unrealizedPl: parseNum(raw.unrealized_pl),
        unrealizedPlPc: parseNum(raw.unrealized_plpc),
        changeToday: parseNum(raw.change_today),
        lastdayPrice: parseNum(raw.lastday_price),
    }
}

export function mapOrder(raw: Record<string, unknown>): AlpacaOrder {
    return {
        id: String(raw.id ?? ''),
        symbol: String(raw.symbol ?? ''),
        qty: parseNum(raw.qty),
        filledQty: parseNumOrNull(raw.filled_qty),
        side: raw.side === 'sell' ? 'sell' : 'buy',
        type: String(raw.type ?? ''),
        status: String(raw.status ?? ''),
        filledAvgPrice: parseNumOrNull(raw.filled_avg_price),
        filledAt: raw.filled_at != null ? String(raw.filled_at) : null,
        createdAt: String(raw.created_at ?? ''),
        limitPrice: parseNumOrNull(raw.limit_price),
        stopPrice: parseNumOrNull(raw.stop_price),
        trailPercent: parseNumOrNull(raw.trail_percent),
        timeInForce: raw.time_in_force != null ? String(raw.time_in_force) : null,
    }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAlpacaClient(config?: AlpacaClientConfig): AlpacaClient {
    const resolvedKeyId = config?.keyId ?? process.env.ALPACA_API_KEY_ID
    const resolvedSecretKey = config?.secretKey ?? process.env.ALPACA_API_SECRET_KEY

    const configured = Boolean(resolvedKeyId && resolvedSecretKey)

    // Lazily initialize SDK only when configured
    const sdk = configured
        ? new Alpaca({
              keyId: resolvedKeyId,
              secretKey: resolvedSecretKey,
              paper: true,
          })
        : null

    return {
        isConfigured(): boolean {
            return configured
        },

        async getAccount(): Promise<AlpacaAccount | null> {
            if (!sdk) return null
            try {
                const raw = await sdk.getAccount()
                return mapAccount(raw as Record<string, unknown>)
            } catch (error) {
                console.warn('[alpaca] getAccount failed:', error)
                return null
            }
        },

        async getPositions(): Promise<AlpacaPosition[]> {
            if (!sdk) return []
            try {
                const raw = (await sdk.getPositions()) as Record<string, unknown>[]
                return raw.map(mapPosition)
            } catch (error) {
                console.warn('[alpaca] getPositions failed:', error)
                return []
            }
        },

        async getPosition(symbol: string): Promise<AlpacaPosition | null> {
            if (!sdk) return null
            try {
                const raw = await sdk.getPosition(symbol)
                return mapPosition(raw as Record<string, unknown>)
            } catch (error: unknown) {
                // 404 means no position held — not an error
                const statusCode =
                    error != null &&
                    typeof error === 'object' &&
                    'statusCode' in error
                        ? (error as { statusCode: number }).statusCode
                        : undefined
                if (statusCode === 404) return null
                console.warn(`[alpaca] getPosition(${symbol}) failed:`, error)
                return null
            }
        },

        async getOrders(params?: { status?: string; limit?: number }): Promise<AlpacaOrder[]> {
            if (!sdk) return []
            try {
                const raw = (await sdk.getOrders({
                    status: params?.status ?? 'all',
                    limit: params?.limit ?? 50,
                    until: undefined,
                    after: undefined,
                    direction: undefined,
                    nested: undefined,
                    symbols: undefined,
                })) as Record<string, unknown>[]
                return raw.map(mapOrder)
            } catch (error) {
                console.warn('[alpaca] getOrders failed:', error)
                return []
            }
        },

        async createOrder(params: CreateOrderParams): Promise<AlpacaOrder | null> {
            if (!sdk) return null
            try {
                const raw = await sdk.createOrder({
                    symbol: params.symbol,
                    qty: params.qty,
                    side: params.side,
                    type: params.type,
                    time_in_force: params.timeInForce ?? 'day',
                    ...(params.limitPrice != null && { limit_price: params.limitPrice }),
                    ...(params.stopPrice != null && { stop_price: params.stopPrice }),
                    ...(params.trailPercent != null && { trail_percent: params.trailPercent }),
                })
                return mapOrder(raw as Record<string, unknown>)
            } catch (error) {
                console.warn('[alpaca] createOrder failed:', error)
                return null
            }
        },

        async cancelOrder(orderId: string): Promise<boolean> {
            if (!sdk) return false
            try {
                await sdk.cancelOrder(orderId)
                return true
            } catch (error) {
                console.warn(`[alpaca] cancelOrder(${orderId}) failed:`, error)
                return false
            }
        },

        async closePosition(symbol: string): Promise<AlpacaOrder | null> {
            if (!sdk) return null
            try {
                const raw = await sdk.closePosition(symbol)
                return mapOrder(raw as Record<string, unknown>)
            } catch (error) {
                console.warn(`[alpaca] closePosition(${symbol}) failed:`, error)
                return null
            }
        },

        async getLastTrade(symbol: string): Promise<{ price: number } | null> {
            if (!sdk) return null
            try {
                const trade = await sdk.getLatestTrade(symbol)
                return { price: parseNum(trade?.Price) }
            } catch {
                return null
            }
        },
    }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: AlpacaClient | null = null

export function getAlpacaClient(): AlpacaClient {
    if (!_instance) {
        _instance = createAlpacaClient()
    }
    return _instance
}

export function resetAlpacaClient(): void {
    _instance = null
}
