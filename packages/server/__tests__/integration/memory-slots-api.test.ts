import { describe, it, expect, beforeEach } from 'bun:test'
import { mockGetSlotContent, mockWriteSlot, mockGetSlotHistory } from './helpers/mock-boundaries'
import { createHonoApp } from '@/routes/index'

const app = createHonoApp()

describe('GET /api/memory/slots', () => {
    beforeEach(() => {
        mockGetSlotContent.mockReset()
        mockGetSlotContent.mockImplementation(() => Promise.resolve(null))
    })

    it('returns all 6 slots with null content by default', async () => {
        const res = await app.request('/api/memory/slots')
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.success).toBe(true)
        expect(Array.isArray(json.data)).toBe(true)
        expect(json.data).toHaveLength(6)
        const slotNames = json.data.map((d: any) => d.slot)
        expect(slotNames).toContain('user_profile')
        expect(slotNames).toContain('agent_strategy')
    })
})

describe('GET /api/memory/slots/:slot', () => {
    beforeEach(() => {
        mockGetSlotContent.mockReset()
        mockGetSlotContent.mockImplementation(() => Promise.resolve(null))
    })

    it('returns 400 for invalid slot name', async () => {
        const res = await app.request('/api/memory/slots/invalid_slot')
        expect(res.status).toBe(400)
        const json = await res.json()
        expect(json.success).toBe(false)
    })

    it('returns slot content for valid slot', async () => {
        mockGetSlotContent.mockImplementationOnce(() => Promise.resolve('偏好成长股'))
        const res = await app.request('/api/memory/slots/user_profile')
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.success).toBe(true)
        expect(json.data.slot).toBe('user_profile')
        expect(json.data.content).toBe('偏好成长股')
    })

    it('returns null content when slot is empty', async () => {
        mockGetSlotContent.mockImplementationOnce(() => Promise.resolve(null))
        const res = await app.request('/api/memory/slots/lessons')
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.data.content).toBeNull()
    })
})

describe('GET /api/memory/slots/:slot/history', () => {
    beforeEach(() => {
        mockGetSlotHistory.mockReset()
        mockGetSlotHistory.mockImplementation(() => Promise.resolve([]))
    })

    it('returns 400 for invalid slot', async () => {
        const res = await app.request('/api/memory/slots/bad_slot/history')
        expect(res.status).toBe(400)
    })

    it('returns version history array', async () => {
        mockGetSlotHistory.mockImplementationOnce(() => Promise.resolve([
            { id: 'v1', slot: 'market_views', content: '看多', author: 'agent', reason: null, createdAt: new Date('2026-04-01') },
        ]))
        const res = await app.request('/api/memory/slots/market_views/history')
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.success).toBe(true)
        expect(json.data).toHaveLength(1)
        expect(json.data[0].id).toBe('v1')
        expect(json.data[0].createdAt).toMatch(/2026-04-01/)
    })

    it('returns 400 when limit is invalid', async () => {
        const res = await app.request('/api/memory/slots/lessons/history?limit=0')
        expect(res.status).toBe(400)
    })
})

describe('GET /api/memory/slots/full', () => {
    beforeEach(() => {
        mockGetSlotContent.mockReset()
        mockGetSlotContent.mockImplementation(() => Promise.resolve(null))
        mockGetSlotHistory.mockReset()
        mockGetSlotHistory.mockImplementation(() => Promise.resolve([]))
    })

    it('returns 6 entries with null content and empty history by default', async () => {
        const res = await app.request('/api/memory/slots/full')
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.success).toBe(true)
        expect(json.data).toHaveLength(6)
        const first = json.data[0]
        expect(first.slot).toBeTruthy()
        expect(first.content).toBeNull()
        expect(first.limit).toBeGreaterThan(0)
        expect(Array.isArray(first.history)).toBe(true)
        expect(first.history).toHaveLength(0)
    })

    it('includes slot limit from SLOT_LIMITS', async () => {
        const res = await app.request('/api/memory/slots/full')
        const json = await res.json()
        const portfolioEntry = json.data.find((d: any) => d.slot === 'portfolio_thesis')
        expect(portfolioEntry.limit).toBe(2000)
        const userEntry = json.data.find((d: any) => d.slot === 'user_profile')
        expect(userEntry.limit).toBe(500)
    })

    it('returns content and history when data exists', async () => {
        mockGetSlotContent.mockImplementation((slot: string) => {
            if (slot === 'market_views') return Promise.resolve('看多科技')
            return Promise.resolve(null)
        })
        mockGetSlotHistory.mockImplementation((slot: string) => {
            if (slot === 'market_views') return Promise.resolve([
                { id: 'v1', slot: 'market_views', content: '看多科技', author: 'agent', reason: '市场信号', createdAt: new Date('2026-04-01') },
            ])
            return Promise.resolve([])
        })

        const res = await app.request('/api/memory/slots/full')
        const json = await res.json()
        const entry = json.data.find((d: any) => d.slot === 'market_views')
        expect(entry.content).toBe('看多科技')
        expect(entry.history).toHaveLength(1)
        expect(entry.history[0].author).toBe('agent')
        expect(entry.history[0].reason).toBe('市场信号')
        expect(entry.history[0].createdAt).toMatch(/2026-04-01/)
    })
})

describe('PUT /api/memory/slots/:slot', () => {
    beforeEach(() => {
        mockWriteSlot.mockReset()
        mockWriteSlot.mockImplementation(() => Promise.resolve())
    })

    it('returns 400 for invalid slot', async () => {
        const res = await app.request('/api/memory/slots/bad_slot', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '内容' }),
        })
        expect(res.status).toBe(400)
    })

    it('writes slot and returns success', async () => {
        const res = await app.request('/api/memory/slots/user_profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '新的投资偏好', reason: '更新' }),
        })
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.success).toBe(true)
        expect(mockWriteSlot).toHaveBeenCalledWith('user_profile', '新的投资偏好', 'user', '更新')
    })

    it('returns 422 when content too long', async () => {
        const { SlotContentTooLongError } = await import('@/core/ai/memory')
        mockWriteSlot.mockImplementationOnce(() =>
            Promise.reject(new SlotContentTooLongError('user_profile', 501, 500)),
        )
        const res = await app.request('/api/memory/slots/user_profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'X'.repeat(501) }),
        })
        expect(res.status).toBe(422)
    })
})
