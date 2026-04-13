import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { getAlpacaClient } from '@/core/broker/alpaca-client'
import { mapAlpacaPositionToHoldingItem } from '@/core/broker/portfolio-calc'
import {
    getHistory,
    getInfo,
    getNews,
    getStockInfo,
    type Period,
    VALID_PERIODS,
} from '@/core/market-data'

const NEWS_DEFAULT_LIMIT = 20
const NEWS_MAX_LIMIT = 50

const symbolParamSchema = z.object({
    symbol: z
        .string()
        .regex(/^[A-Za-z0-9.\-^]{1,10}$/, 'Invalid symbol format'),
})

const historyQuerySchema = z.object({
    period: z.string().optional().default('1M'),
})

const limitErrorMsg = `Invalid limit. Must be 1-${NEWS_MAX_LIMIT}`

const newsQuerySchema = z.object({
    limit: z
        .string()
        .optional()
        .default(String(NEWS_DEFAULT_LIMIT))
        .transform((val, ctx) => {
            const n = Number(val)
            if (
                !Number.isFinite(n) ||
                !Number.isInteger(n) ||
                n < 1 ||
                n > NEWS_MAX_LIMIT
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: limitErrorMsg,
                })
                return z.NEVER
            }
            return n
        }),
})

const onValidationError = (
    result: { success: boolean; error?: readonly { message: string }[] },
    c: { json: (data: unknown, status: number) => Response },
) => {
    if (!result.success) {
        const message = result.error?.[0]?.message ?? 'Validation failed'
        return c.json({ success: false, error: message }, 400)
    }
}

const stocks = new Hono()
    .get(
        '/:symbol/history',
        sValidator('param', symbolParamSchema, onValidationError),
        sValidator('query', historyQuerySchema, onValidationError),
        async (c) => {
            try {
                const symbol = c.req.valid('param').symbol.toUpperCase()
                const period = c.req.valid('query').period.toUpperCase()

                if (!VALID_PERIODS.includes(period as Period)) {
                    return c.json(
                        {
                            success: false,
                            error: `Invalid period. Valid values: ${VALID_PERIODS.join(', ')}`,
                        },
                        400,
                    )
                }

                const data = await getHistory(symbol, period as Period)
                return c.json({ success: true, data })
            } catch {
                return c.json(
                    { success: false, error: 'Failed to fetch stock history' },
                    500,
                )
            }
        },
    )

    .get(
        '/:symbol/info',
        sValidator('param', symbolParamSchema, onValidationError),
        async (c) => {
            try {
                const symbol = c.req.valid('param').symbol.toUpperCase()
                const data = await getStockInfo(symbol)
                return c.json({ success: true, data })
            } catch {
                return c.json(
                    { success: false, error: 'Failed to fetch stock info' },
                    500,
                )
            }
        },
    )

    .get(
        '/:symbol/news',
        sValidator('param', symbolParamSchema, onValidationError),
        sValidator('query', newsQuerySchema, onValidationError),
        async (c) => {
            try {
                const symbol = c.req.valid('param').symbol.toUpperCase()
                const { limit } = c.req.valid('query')
                const data = await getNews(symbol, limit)
                return c.json({ success: true, data })
            } catch {
                return c.json(
                    { success: false, error: 'Failed to fetch news' },
                    500,
                )
            }
        },
    )

    .get(
        '/:symbol/position',
        sValidator('param', symbolParamSchema, onValidationError),
        async (c) => {
            try {
                const { symbol } = c.req.valid('param')
                const alpaca = getAlpacaClient()
                const position = await alpaca.getPosition(symbol.toUpperCase())

                if (!position) {
                    return c.json({ success: true as const, data: null })
                }

                let name: string | null = null
                try {
                    const info = await getInfo(symbol.toUpperCase())
                    name = info.name ?? null
                } catch {
                    /* Name lookup failed */
                }

                const holdingItem = mapAlpacaPositionToHoldingItem(
                    position,
                    name,
                )
                return c.json({ success: true as const, data: holdingItem })
            } catch {
                return c.json({ success: true as const, data: null })
            }
        },
    )

export default stocks
