import { describe, it, expect, beforeEach } from 'bun:test'
import { mockSearchMemory } from './helpers/mock-boundaries'

import { createHonoApp } from '@/routes/index'
const app = createHonoApp()

describe('GET /api/memory/search', () => {
    beforeEach(() => {
        mockSearchMemory.mockReset()
        mockSearchMemory.mockImplementation(() => Promise.resolve([]))
    })

    it('returns 400 when q is missing', async () => {
        const res = await app.request('/api/memory/search')
        expect(res.status).toBe(400)
    })

    it('returns search results for valid query', async () => {
        mockSearchMemory.mockImplementation(() =>
            Promise.resolve([
                {
                    docPath: 'portfolio.md',
                    content: 'AAPL 200股',
                    score: 0.92,
                    entities: ['AAPL', 'Apple'],
                    evergreen: false,
                },
            ]),
        )

        const res = await app.request('/api/memory/search?q=test')
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.success).toBe(true)
        expect(Array.isArray(json.data)).toBe(true)
        expect(json.data.length).toBe(1)
        expect(json.data[0].docPath).toBe('portfolio.md')
    })

    it('passes symbol and limit to searchMemory', async () => {
        mockSearchMemory.mockImplementation(() => Promise.resolve([]))

        const res = await app.request('/api/memory/search?q=test&symbol=AAPL&limit=3')
        expect(res.status).toBe(200)
        expect(mockSearchMemory).toHaveBeenCalledWith(
            'test',
            undefined,
            { symbol: 'AAPL', limit: 3 },
        )
    })

    it('respects limit parameter', async () => {
        mockSearchMemory.mockImplementation(() =>
            Promise.resolve([
                { docPath: 'a.md', content: 'a', score: 0.9, entities: [], evergreen: false },
                { docPath: 'b.md', content: 'b', score: 0.8, entities: [], evergreen: false },
                { docPath: 'c.md', content: 'c', score: 0.7, entities: [], evergreen: false },
            ]),
        )

        const res = await app.request('/api/memory/search?q=test&limit=3')
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.data.length).toBeLessThanOrEqual(3)
    })

    it('returns 400 for invalid limit (too large)', async () => {
        const res = await app.request('/api/memory/search?q=test&limit=999')
        expect(res.status).toBe(400)
    })

    it('returns 400 for invalid limit (not a number)', async () => {
        const res = await app.request('/api/memory/search?q=test&limit=abc')
        expect(res.status).toBe(400)
    })

    it('returns 400 for invalid limit (zero)', async () => {
        const res = await app.request('/api/memory/search?q=test&limit=0')
        expect(res.status).toBe(400)
    })

    it('truncates content to 500 chars in response', async () => {
        const longContent = 'x'.repeat(800)
        mockSearchMemory.mockImplementation(() =>
            Promise.resolve([
                { docPath: 'long.md', content: longContent, score: 0.9, entities: [], evergreen: false },
            ]),
        )

        const res = await app.request('/api/memory/search?q=test')
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.data[0].content.length).toBeLessThanOrEqual(500)
    })

    it('handles searchMemory errors gracefully', async () => {
        mockSearchMemory.mockImplementation(() => Promise.reject(new Error('Search failed')))

        const res = await app.request('/api/memory/search?q=test')
        expect(res.status).toBe(500)
        const json = await res.json()
        expect(json.success).toBe(false)
    })
})
