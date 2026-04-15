import { Hono } from 'hono'
import { getMacro } from '@/core/market-data'

const macro = new Hono().get('/', async (c) => {
    try {
        const indicators = await getMacro()
        return c.json({ success: true, data: indicators })
    } catch {
        return c.json(
            { success: false, error: 'Failed to fetch macro indicators' },
            500,
        )
    }
})

export default macro
