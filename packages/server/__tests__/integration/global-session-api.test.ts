import { beforeEach, describe, expect, test } from 'bun:test'
import './setup'
import { createHonoApp } from '@/routes/index'
import {
    mockDeleteSession,
    mockListAllSessions,
    mockLoadMessages,
    mockLoadMessageManifest,
    mockLoadSessionError,
    mockRenameSession,
} from './helpers/mock-boundaries'

const app = createHonoApp()

describe('GET /api/sessions', () => {
    beforeEach(() => {
        mockListAllSessions.mockReset()
    })

    test('returns all sessions', async () => {
        mockListAllSessions.mockResolvedValueOnce([
            {
                id: '1',
                symbol: 'AAPL',
                title: 'test',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: '2',
                symbol: null,
                title: 'general',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
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
    beforeEach(() => {
        mockDeleteSession.mockReset()
    })

    test('deletes session successfully', async () => {
        mockDeleteSession.mockResolvedValueOnce(undefined)
        const res = await app.request('/api/sessions/ses_1', {
            method: 'DELETE',
        })
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
    })

    test('returns 404 for non-existent session', async () => {
        const { SessionError } = await import('@/core/ai/session')
        mockDeleteSession.mockRejectedValueOnce(
            new SessionError('Session not found', 'NOT_FOUND'),
        )
        const res = await app.request('/api/sessions/not_exist', {
            method: 'DELETE',
        })
        expect(res.status).toBe(404)
    })
})

describe('PATCH /api/sessions/:id', () => {
    beforeEach(() => {
        mockRenameSession.mockReset()
    })

    test('renames session successfully', async () => {
        mockRenameSession.mockResolvedValueOnce({
            id: 'ses_1',
            symbol: null,
            title: '新标题',
            createdAt: new Date(),
            updatedAt: new Date(),
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
    beforeEach(() => {
        mockLoadMessages.mockReset()
        mockLoadSessionError.mockReset()
    })

    test('returns { messages, error: null } when session has no error', async () => {
        mockLoadMessages.mockResolvedValueOnce([
            {
                id: 'msg_1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            },
        ])
        mockLoadSessionError.mockResolvedValueOnce(null)
        const res = await app.request('/api/sessions/ses_1/messages')
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.data.messages).toHaveLength(1)
        expect(json.data.error).toBeNull()
    })

    test('returns persisted error record alongside messages', async () => {
        mockLoadMessages.mockResolvedValueOnce([
            {
                id: 'msg_1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
            },
        ])
        mockLoadSessionError.mockResolvedValueOnce({
            message: 'rate limited',
            name: 'RateLimitError',
            code: 'RATE',
        })
        const res = await app.request('/api/sessions/ses_1/messages')
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.data.messages).toHaveLength(1)
        expect(json.data.error).toEqual({
            message: 'rate limited',
            name: 'RateLimitError',
            code: 'RATE',
        })
    })

    test('returns 404 when session does not exist', async () => {
        const { SessionError } = await import('@/core/ai/session')
        mockLoadSessionError.mockRejectedValueOnce(
            new SessionError('Session not found', 'NOT_FOUND'),
        )
        const res = await app.request('/api/sessions/missing/messages')
        expect(res.status).toBe(404)
    })
})

describe('GET /api/sessions/:id/messages/:messageId/context', () => {
    beforeEach(() => {
        mockLoadMessageManifest.mockReset()
    })

    test('returns stored manifest data', async () => {
        mockLoadMessageManifest.mockResolvedValueOnce({
            version: 1,
            runId: 'run-1',
            manifest: {
                runId: 'run-1',
                createdAt: '2024-06-01T00:00:00.000Z',
                input: {
                    channel: 'web',
                    mode: 'conversation',
                    agentType: 'trading-agent',
                    rawMessages: [],
                    defaults: {},
                },
                pluginOutputs: [],
                assembledContext: {
                    segments: [],
                    systemSegments: [],
                    tools: [],
                    params: { candidates: [], resolved: {} },
                    totalEstimatedInputTokens: 0,
                },
                modelRequest: {
                    systemText: '',
                    modelMessages: [],
                    toolNames: [],
                    resolvedParams: {},
                    providerOptions: {},
                },
            },
        })

        const res = await app.request(
            '/api/sessions/ses_1/messages/msg_1/context',
        )
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.data).toEqual({
            version: 1,
            runId: 'run-1',
            manifest: expect.any(Object),
        })
        expect(json.data.manifest.runId).toBe('run-1')
    })

    test('returns null data when manifest is missing', async () => {
        mockLoadMessageManifest.mockResolvedValueOnce(null)

        const res = await app.request(
            '/api/sessions/ses_1/messages/msg_1/context',
        )
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.data).toBeNull()
    })

    test('returns 404 when session is missing', async () => {
        const { SessionError } = await import('@/core/ai/session')
        mockLoadMessageManifest.mockRejectedValueOnce(
            new SessionError('Session not found', 'NOT_FOUND'),
        )

        const res = await app.request(
            '/api/sessions/missing/messages/msg_1/context',
        )

        expect(res.status).toBe(404)
    })

    test('returns 404 when message is missing', async () => {
        const { SessionError } = await import('@/core/ai/session')
        mockLoadMessageManifest.mockRejectedValueOnce(
            new SessionError('Message not found', 'NOT_FOUND'),
        )

        const res = await app.request(
            '/api/sessions/ses_1/messages/missing/context',
        )

        expect(res.status).toBe(404)
    })
})
