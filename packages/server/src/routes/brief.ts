import { Hono } from 'hono'
import { generateBrief } from '@/core/ai/brief'

const brief = new Hono()
    .get('/', async (c) => {
        try {
            const result = await generateBrief(false)
            return c.json({
                success: true,
                data: result.data,
                cached: result.cached,
                generatedAt: result.generatedAt,
            })
        } catch {
            return c.json(
                { success: false, error: 'Failed to generate brief' },
                500,
            )
        }
    })
    .post('/', async (c) => {
        try {
            const result = await generateBrief(true)
            return c.json({
                success: true,
                data: result.data,
                cached: false,
                generatedAt: result.generatedAt,
            })
        } catch {
            return c.json(
                { success: false, error: 'Failed to generate brief' },
                500,
            )
        }
    })

export default brief
