import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
    deleteSession,
    listAllSessions,
    loadMessages,
    loadSessionError,
    renameSession,
    SessionError,
} from '@/core/ai/session'

const SESSION_ERROR_CODE_TO_STATUS = {
    NOT_FOUND: 404,
    INVALID_INPUT: 400,
} as const

const sessionRenameSchema = z.object({
    title: z.string().trim().min(1).max(20),
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

const sessions = new Hono()
    .get('/', async (c) => {
        try {
            const allSessions = await listAllSessions()
            return c.json({ success: true, data: allSessions })
        } catch {
            return c.json(
                { success: false, error: 'Failed to fetch sessions' },
                500,
            )
        }
    })

    .delete('/:id', async (c) => {
        try {
            const id = c.req.param('id')
            await deleteSession(id)
            return c.json({ success: true })
        } catch (error) {
            if (error instanceof SessionError) {
                const status = SESSION_ERROR_CODE_TO_STATUS[error.code] ?? 500
                return c.json(
                    { success: false, error: error.message },
                    status as 400 | 404 | 409 | 500,
                )
            }
            return c.json(
                { success: false, error: 'Failed to delete session' },
                500,
            )
        }
    })

    .patch(
        '/:id',
        sValidator('json', sessionRenameSchema, onValidationError),
        async (c) => {
            try {
                const id = c.req.param('id')
                const { title } = c.req.valid('json')
                const session = await renameSession(id, title)
                return c.json({ success: true, data: session })
            } catch (error) {
                if (error instanceof SessionError) {
                    const status =
                        SESSION_ERROR_CODE_TO_STATUS[error.code] ?? 500
                    return c.json(
                        { success: false, error: error.message },
                        status as 400 | 404 | 409 | 500,
                    )
                }
                return c.json(
                    { success: false, error: 'Failed to rename session' },
                    500,
                )
            }
        },
    )

    .get('/:id/messages', async (c) => {
        try {
            const id = c.req.param('id')
            const [messages, lastError] = await Promise.all([
                loadMessages(id),
                loadSessionError(id),
            ])
            return c.json({
                success: true,
                data: { messages, error: lastError },
            })
        } catch (error) {
            if (error instanceof SessionError) {
                const status = SESSION_ERROR_CODE_TO_STATUS[error.code] ?? 500
                return c.json(
                    { success: false, error: error.message },
                    status as 400 | 404 | 409 | 500,
                )
            }
            return c.json(
                { success: false, error: 'Failed to load messages' },
                500,
            )
        }
    })

export default sessions
