import { describe, test, expect, beforeEach } from 'bun:test'
import {
    mockListAllSessions,
    mockDeleteSession,
    mockRenameSession,
    mockLoadMessages,
} from './helpers/mock-boundaries'
import { createHonoApp } from '@/routes/index'

const app = createHonoApp()

describe('GET /api/sessions', () => {
    beforeEach(() => {
        mockListAllSessions.mockReset()
    })

    test('returns all sessions', async () => {
        mockListAllSessions.mockResolvedValueOnce([
            { id: '1', symbol: 'AAPL', title: 'test', createdAt: new Date(), updatedAt: new Date() },
            { id: '2', symbol: null, title: 'general', createdAt: new Date(), updatedAt: new Date() },
        ])
        const res = await app.request('/api/sessions')
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.data).toHaveLength(2)
    })

    test('returns empty list', async () => {
        mockListAllSessions.mockResolvedValueOnce([])
        const res = await app.request('/api/sessions')
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.data).toEqual([])
    })
})

describe('DELETE /api/sessions/:id', () => {
    beforeEach(() => { mockDeleteSession.mockReset() })

    test('deletes session successfully', async () => {
        mockDeleteSession.mockResolvedValueOnce(undefined)
        const res = await app.request('/api/sessions/ses_1', { method: 'DELETE' })
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
    })

    test('returns 404 for non-existent session', async () => {
        const { SessionError } = await import('@/core/ai/session')
        mockDeleteSession.mockRejectedValueOnce(new SessionError('Session not found', 'NOT_FOUND'))
        const res = await app.request('/api/sessions/not_exist', { method: 'DELETE' })
        expect(res.status).toBe(404)
    })
})

describe('PATCH /api/sessions/:id', () => {
    beforeEach(() => { mockRenameSession.mockReset() })

    test('renames session successfully', async () => {
        mockRenameSession.mockResolvedValueOnce({
            id: 'ses_1', symbol: null, title: '新标题', createdAt: new Date(), updatedAt: new Date(),
        })
        const res = await app.request('/api/sessions/ses_1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '新标题' }),
        })
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.data.title).toBe('新标题')
    })

    test('returns 400 for empty title', async () => {
        const res = await app.request('/api/sessions/ses_1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '' }),
        })
        expect(res.status).toBe(400)
    })
})

describe('GET /api/sessions/:id/messages', () => {
    beforeEach(() => { mockLoadMessages.mockReset() })

    test('loads session messages', async () => {
        mockLoadMessages.mockResolvedValueOnce([
            { id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
        ])
        const res = await app.request('/api/sessions/ses_1/messages')
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.data).toHaveLength(1)
    })
})
