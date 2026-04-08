import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { getSlotContent, writeSlot, getSlotHistory, VALID_SLOTS, SLOT_LIMITS } from '@/core/ai/memory'
import type { MemorySlot } from '@/core/ai/memory'

const SLOT_SCHEMA = z.enum(VALID_SLOTS as [MemorySlot, ...MemorySlot[]])

const slotParamSchema = z.object({
    slot: SLOT_SCHEMA,
})

const slotWriteBodySchema = z.object({
    content: z.string().min(1),
    reason: z.string().optional(),
})

const historyQuerySchema = z.object({
    limit: z
        .string()
        .optional()
        .default('10')
        .transform((val, ctx) => {
            const n = Number(val)
            if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 50) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'limit must be 1-50' })
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

    // GET /api/memory/slots — 列出所有 slot 最新内容
    .get('/slots', async (c) => {
        try {
            const entries = await Promise.all(
                VALID_SLOTS.map(async (slot) => {
                    const content = await getSlotContent(slot)
                    return { slot, content }
                }),
            )
            return c.json({ success: true, data: entries })
        } catch {
            return c.json({ success: false, error: 'Failed to list slots' }, 500)
        }
    })

    // GET /api/memory/slots/full — 聚合端点，一次返回所有 slot 的当前内容 + 版本历史
    .get('/slots/full', async (c) => {
        try {
            const data = await Promise.all(
                VALID_SLOTS.map(async (slot) => {
                    const [content, history] = await Promise.all([
                        getSlotContent(slot),
                        getSlotHistory(slot, 20),
                    ])
                    return {
                        slot,
                        content,
                        limit: SLOT_LIMITS[slot],
                        history: history.map((v) => ({
                            id: v.id,
                            author: v.author,
                            reason: v.reason,
                            createdAt: v.createdAt.toISOString(),
                            content: v.content,
                        })),
                    }
                }),
            )
            return c.json({ success: true, data })
        } catch {
            return c.json({ success: false, error: 'Failed to load full slot data' }, 500)
        }
    })

    // GET /api/memory/slots/:slot — 获取指定 slot 最新内容
    .get('/slots/:slot', async (c) => {
        const parsed = slotParamSchema.safeParse({ slot: c.req.param('slot') })
        if (!parsed.success) {
            return c.json({ success: false, error: 'Invalid slot name' }, 400)
        }
        try {
            const content = await getSlotContent(parsed.data.slot)
            return c.json({ success: true, data: { slot: parsed.data.slot, content } })
        } catch {
            return c.json({ success: false, error: 'Failed to read slot' }, 500)
        }
    })

    // GET /api/memory/slots/:slot/history — 获取版本历史
    .get(
        '/slots/:slot/history',
        sValidator('query', historyQuerySchema, onValidationError),
        async (c) => {
            const parsed = slotParamSchema.safeParse({ slot: c.req.param('slot') })
            if (!parsed.success) {
                return c.json({ success: false, error: 'Invalid slot name' }, 400)
            }
            try {
                const { limit } = c.req.valid('query')
                const history = await getSlotHistory(parsed.data.slot, limit)
                return c.json({
                    success: true,
                    data: history.map((v) => ({
                        id: v.id,
                        author: v.author,
                        reason: v.reason,
                        createdAt: v.createdAt.toISOString(),
                        content: v.content,
                    })),
                })
            } catch {
                return c.json({ success: false, error: 'Failed to read slot history' }, 500)
            }
        },
    )

    // PUT /api/memory/slots/:slot — 用户手动写入
    .put(
        '/slots/:slot',
        sValidator('json', slotWriteBodySchema, onValidationError),
        async (c) => {
            const parsed = slotParamSchema.safeParse({ slot: c.req.param('slot') })
            if (!parsed.success) {
                return c.json({ success: false, error: 'Invalid slot name' }, 400)
            }
            try {
                const { content, reason } = c.req.valid('json')
                await writeSlot(parsed.data.slot, content, 'user', reason)
                return c.json({ success: true })
            } catch (e: any) {
                if (e?.name === 'SlotContentTooLongError') {
                    return c.json({ success: false, error: e.message }, 422)
                }
                return c.json({ success: false, error: 'Failed to write slot' }, 500)
            }
        },
    )

export default memory
