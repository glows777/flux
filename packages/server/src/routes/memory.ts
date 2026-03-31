import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
    deleteDocument,
    getDocumentDetail,
    listDocuments,
    searchMemory,
    writeDocument,
} from '@/core/ai/memory'

/** Memory path param: disallow "..", leading "/" etc. */
const memoryPathParamSchema = z.object({
    path: z.string().min(1).regex(/^[a-zA-Z0-9_\-/]+(\.[a-zA-Z0-9]+)?$/, 'Invalid memory path'),
})

/** PUT body: overwrite document content */
const memoryWriteBodySchema = z.object({
    content: z.string(),
})

/** POST body: create new document */
const memoryCreateBodySchema = z.object({
    path: z.string().min(1).regex(/^[a-zA-Z0-9_\-/]+(\.[a-zA-Z0-9]+)?$/, 'Invalid memory path'),
    content: z.string(),
})

/** GET /memory/search query params */
const memorySearchQuerySchema = z.object({
    q: z.string().min(1),
    symbol: z.string().optional(),
    limit: z.string().optional().default('5').transform((val, ctx) => {
        const n = Number(val)
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 20) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'limit must be 1-20' })
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

const memory = new Hono()
    .get('/', async (c) => {
        try {
            const docs = await listDocuments()
            return c.json({ success: true, data: docs })
        } catch {
            return c.json(
                { success: false, error: 'Failed to list memory documents' },
                500,
            )
        }
    })

    .get(
        '/search',
        sValidator('query', memorySearchQuerySchema, onValidationError),
        async (c) => {
            try {
                const { q, symbol, limit } = c.req.valid('query')
                const results = await searchMemory(q, undefined, { symbol, limit })
                const data = results.map((r) => ({
                    id: r.id,
                    docPath: r.docPath,
                    content: r.content.length > 500 ? r.content.slice(0, 500) : r.content,
                    score: r.score,
                    entities: r.entities,
                }))
                return c.json({ success: true, data })
            } catch {
                return c.json(
                    { success: false, error: 'Failed to search memory' },
                    500,
                )
            }
        },
    )

    .get(
        '/:path{.+}',
        async (c) => {
            try {
                const path = c.req.param('path')
                const parsed = memoryPathParamSchema.safeParse({ path })
                if (!parsed.success) {
                    return c.json({ success: false, error: 'Invalid memory path' }, 400)
                }
                const doc = await getDocumentDetail(parsed.data.path)
                if (doc === null) {
                    return c.json({ success: false, error: 'Document not found' }, 404)
                }
                return c.json({ success: true, data: doc })
            } catch {
                return c.json(
                    { success: false, error: 'Failed to read memory document' },
                    500,
                )
            }
        },
    )

    .put(
        '/:path{.+}',
        sValidator('json', memoryWriteBodySchema, onValidationError),
        async (c) => {
            try {
                const path = c.req.param('path')
                const parsed = memoryPathParamSchema.safeParse({ path })
                if (!parsed.success) {
                    return c.json({ success: false, error: 'Invalid memory path' }, 400)
                }
                const { content } = c.req.valid('json')
                await writeDocument(parsed.data.path, content)
                return c.json({ success: true })
            } catch {
                return c.json(
                    { success: false, error: 'Failed to write memory document' },
                    500,
                )
            }
        },
    )

    .post(
        '/',
        sValidator('json', memoryCreateBodySchema, onValidationError),
        async (c) => {
            try {
                const { path, content } = c.req.valid('json')
                await writeDocument(path, content)
                return c.json({ success: true }, 201)
            } catch {
                return c.json(
                    { success: false, error: 'Failed to create memory document' },
                    500,
                )
            }
        },
    )

    .delete(
        '/:path{.+}',
        async (c) => {
            try {
                const path = c.req.param('path')
                const parsed = memoryPathParamSchema.safeParse({ path })
                if (!parsed.success) {
                    return c.json({ success: false, error: 'Invalid memory path' }, 400)
                }
                await deleteDocument(parsed.data.path)
                return c.json({ success: true })
            } catch {
                return c.json(
                    { success: false, error: 'Failed to delete memory document' },
                    500,
                )
            }
        },
    )

export default memory
