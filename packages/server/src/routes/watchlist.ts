import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
    type AddWatchlistError,
    addToWatchlist,
    getWatchlistItems,
    type RemoveWatchlistError,
    removeFromWatchlist,
} from '@/core/api/watchlist'

const ADD_ERROR_CODE_TO_STATUS = {
    INVALID_INPUT: 400,
    SYMBOL_NOT_FOUND: 404,
    DUPLICATE: 409,
} as const

const REMOVE_ERROR_CODE_TO_STATUS = {
    INVALID_INPUT: 400,
    NOT_FOUND: 404,
} as const

const addWatchlistSchema = z.object({
    symbol: z
        .string()
        .min(1, 'Invalid symbol format')
        .max(10, 'Invalid symbol format'),
    name: z.string().optional(),
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

const watchlist = new Hono()
    .get('/', async (c) => {
        try {
            const items = await getWatchlistItems()
            return c.json({ success: true, data: items })
        } catch {
            return c.json(
                { success: false, error: 'Failed to fetch watchlist' },
                500,
            )
        }
    })
    .post(
        '/',
        sValidator('json', addWatchlistSchema, onValidationError),
        async (c) => {
            try {
                const body = c.req.valid('json')
                const item = await addToWatchlist(body)
                return c.json({ success: true, data: item }, 201)
            } catch (error) {
                if (error instanceof Error && 'code' in error) {
                    const { code } = error as AddWatchlistError
                    const status = ADD_ERROR_CODE_TO_STATUS[code] ?? 500
                    return c.json(
                        { success: false, error: error.message },
                        status as 400 | 404 | 409 | 500,
                    )
                }
                return c.json(
                    { success: false, error: 'Failed to add to watchlist' },
                    500,
                )
            }
        },
    )
    .delete('/:symbol', async (c) => {
        try {
            const symbol = c.req.param('symbol')
            await removeFromWatchlist(symbol)
            return c.json({ success: true })
        } catch (error) {
            if (error instanceof Error && 'code' in error) {
                const { code } = error as RemoveWatchlistError
                const status = REMOVE_ERROR_CODE_TO_STATUS[code] ?? 500
                return c.json(
                    { success: false, error: error.message },
                    status as 400 | 404 | 500,
                )
            }
            return c.json(
                { success: false, error: 'Failed to remove from watchlist' },
                500,
            )
        }
    })

export default watchlist
