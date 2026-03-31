import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { getReportWithCache } from '@/core/ai/cache'
import { getAlpacaClient } from '@/core/broker/alpaca-client'
import { mapAlpacaPositionToHoldingItem } from '@/core/broker/portfolio-calc'
import {
    FMP_ERROR_CODE_TO_STATUS,
    type FmpErrorCode,
    getL1WithCache,
    getL2WithCache,
    getQuartersWithCache,
    saveTranscript,
} from '@/core/finance'
import {
    getHistory,
    type Period,
    VALID_PERIODS,
    getNews,
    getStockInfo,
    getInfo,
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

const reportBodySchema = z.object({
    forceRefresh: z.boolean().optional().default(false),
})

const earningsQuerySchema = z.object({
    year: z
        .string()
        .optional()
        .transform((val, ctx) => {
            if (val === undefined) return undefined
            const n = Number(val)
            if (
                !Number.isFinite(n) ||
                !Number.isInteger(n) ||
                n < 1900 ||
                n > 2100
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Invalid year',
                })
                return z.NEVER
            }
            return n
        }),
    quarter: z
        .string()
        .optional()
        .transform((val, ctx) => {
            if (val === undefined) return undefined
            const n = Number(val)
            if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 4) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Invalid quarter. Must be 1-4',
                })
                return z.NEVER
            }
            return n
        }),
    forceRefresh: z
        .string()
        .optional()
        .transform((val) => val === 'true'),
})

const earningsAnalysisBodySchema = z.object({
    year: z.number().int().min(1900).max(2100),
    quarter: z.number().int().min(1).max(4),
    forceRefresh: z.boolean().optional().default(false),
})

const transcriptUploadSchema = z.object({
    year: z.number().int().min(1900).max(2100),
    quarter: z.number().int().min(1).max(4),
    content: z.string().trim().min(100).max(200_000),
    reportDate: z
        .string()
        .regex(
            /^\d{4}-\d{2}-\d{2}$/,
            'Invalid date format (expected YYYY-MM-DD)',
        ),
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

    .post(
        '/:symbol/report',
        sValidator('param', symbolParamSchema, onValidationError),
        sValidator('json', reportBodySchema, onValidationError),
        async (c) => {
            try {
                const symbol = c.req.valid('param').symbol.toUpperCase()
                const { forceRefresh } = c.req.valid('json')

                const report = await getReportWithCache(symbol, forceRefresh)

                return c.json({
                    success: true,
                    data: {
                        symbol: report.symbol,
                        content: report.content,
                        createdAt: report.createdAt.toISOString(),
                        cached: report.cached,
                    },
                })
            } catch {
                return c.json(
                    { success: false, error: 'Failed to generate report' },
                    500,
                )
            }
        },
    )

    // ─── Earnings endpoints ───

    .get(
        '/:symbol/earnings/quarters',
        sValidator('param', symbolParamSchema, onValidationError),
        async (c) => {
            try {
                const symbol = c.req.valid('param').symbol.toUpperCase()
                const result = await getQuartersWithCache(symbol)
                return c.json({ success: true, data: result.data })
            } catch (error) {
                if (error instanceof Error && 'code' in error) {
                    const { code } = error as { code: FmpErrorCode }
                    const status = FMP_ERROR_CODE_TO_STATUS[code] ?? 500
                    return c.json(
                        { success: false, error: error.message },
                        status as 404 | 429 | 500 | 502,
                    )
                }
                return c.json(
                    {
                        success: false,
                        error: 'Failed to fetch available quarters',
                    },
                    500,
                )
            }
        },
    )

    .get(
        '/:symbol/earnings',
        sValidator('param', symbolParamSchema, onValidationError),
        sValidator('query', earningsQuerySchema, onValidationError),
        async (c) => {
            try {
                const symbol = c.req.valid('param').symbol.toUpperCase()
                const { year, quarter, forceRefresh } = c.req.valid('query')

                const data = await getL1WithCache(
                    symbol,
                    year,
                    quarter,
                    forceRefresh,
                )
                return c.json({ success: true, data })
            } catch (error) {
                if (error instanceof Error && 'code' in error) {
                    const { code } = error as { code: FmpErrorCode }
                    const status = FMP_ERROR_CODE_TO_STATUS[code] ?? 500
                    return c.json(
                        { success: false, error: error.message },
                        status as 404 | 429 | 500 | 502,
                    )
                }
                return c.json(
                    { success: false, error: 'Failed to fetch earnings data' },
                    500,
                )
            }
        },
    )

    .post(
        '/:symbol/earnings/analysis',
        sValidator('param', symbolParamSchema, onValidationError),
        sValidator('json', earningsAnalysisBodySchema, onValidationError),
        async (c) => {
            try {
                const symbol = c.req.valid('param').symbol.toUpperCase()
                const { year, quarter, forceRefresh } = c.req.valid('json')

                const l1Result = await getL1WithCache(
                    symbol,
                    year,
                    quarter,
                    forceRefresh,
                )
                const data = await getL2WithCache(
                    symbol,
                    year,
                    quarter,
                    l1Result.data,
                    forceRefresh,
                )
                return c.json({ success: true, data })
            } catch (error) {
                if (error instanceof Error && 'code' in error) {
                    const { code } = error as { code: FmpErrorCode }
                    const status = FMP_ERROR_CODE_TO_STATUS[code] ?? 500
                    return c.json(
                        { success: false, error: error.message, code },
                        status as 404 | 429 | 500 | 502,
                    )
                }
                return c.json(
                    {
                        success: false,
                        error: 'Failed to generate earnings analysis',
                    },
                    500,
                )
            }
        },
    )

    .put(
        '/:symbol/earnings/transcript',
        sValidator('param', symbolParamSchema, onValidationError),
        sValidator('json', transcriptUploadSchema, onValidationError),
        async (c) => {
            try {
                const symbol = c.req.valid('param').symbol.toUpperCase()
                const { year, quarter, content, reportDate } =
                    c.req.valid('json')

                const result = await saveTranscript(
                    symbol,
                    year,
                    quarter,
                    content,
                    new Date(reportDate),
                )
                return c.json({ success: true, data: result })
            } catch {
                return c.json(
                    { success: false, error: 'Failed to save transcript' },
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
                } catch { /* Name lookup failed */ }

                const holdingItem = mapAlpacaPositionToHoldingItem(position, name)
                return c.json({ success: true as const, data: holdingItem })
            } catch {
                return c.json({ success: true as const, data: null })
            }
        },
    )

export default stocks
