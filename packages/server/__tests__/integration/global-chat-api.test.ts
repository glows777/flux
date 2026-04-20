import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { Gateway } from '@/gateway/gateway'
import { createHonoApp } from '@/routes/index'
import { mockRuntimeChat, mockRuntimeFinalize } from './helpers/mock-boundaries'

// Create a mock gateway that delegates to mockRuntimeChat
const mockGatewayChat = mock(() => mockRuntimeChat())
const mockGateway = { chat: mockGatewayChat }

const app = createHonoApp({ gateway: mockGateway as unknown as Gateway })

const validMessages = [
    {
        id: 'msg_1',
        role: 'user',
        parts: [{ type: 'text', text: '什么是PE？' }],
    },
]

describe('POST /api/chat', () => {
    beforeEach(() => {
        mockRuntimeChat.mockReset()
        mockRuntimeFinalize.mockReset()
        mockGatewayChat.mockReset()

        mockRuntimeChat.mockResolvedValue({
            streamResult: {
                text: Promise.resolve('mock pipeline response'),
                usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
                steps: Promise.resolve([]),
                toUIMessageStreamResponse: (_opts?: unknown) =>
                    new Response('data: test\n\n', {
                        headers: { 'Content-Type': 'text/event-stream' },
                    }),
                toUIMessageStream: (_opts?: unknown) => new ReadableStream(),
            },
            sessionId: 'ses_new',
            consumeStream: () =>
                Promise.resolve({
                    text: 'mock pipeline response',
                    responseMessage: {
                        id: 'r1',
                        role: 'assistant',
                        parts: [
                            { type: 'text', text: 'mock pipeline response' },
                        ],
                        createdAt: new Date(),
                    },
                    toolCalls: [],
                    usage: { inputTokens: 100, outputTokens: 50 },
                    contextManifest: {
                        runId: 'run-1',
                        createdAt: new Date().toISOString(),
                        input: {} as never,
                        pluginOutputs: [],
                        assembledContext: {} as never,
                        modelRequest: {} as never,
                    },
                }),
            finalize: mockRuntimeFinalize,
            getContextManifest: () => ({
                runId: 'run-1',
                createdAt: new Date().toISOString(),
                input: {} as never,
                pluginOutputs: [],
                assembledContext: {} as never,
                modelRequest: {} as never,
            }),
        })

        mockGatewayChat.mockImplementation((_input: unknown) =>
            mockRuntimeChat(),
        )
    })

    test('returns 200 with streaming response', async () => {
        const res = await app.request('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: validMessages }),
        })
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    })

    test('calls gateway.chat with correct params (no symbol)', async () => {
        await app.request('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: validMessages }),
        })
        expect(mockGatewayChat).toHaveBeenCalledWith(
            expect.objectContaining({ channel: 'web' }),
        )
        const callArgs = mockGatewayChat.mock.calls[0][0]
        expect(callArgs.symbol).toBeUndefined()
    })

    test('calls gateway.chat with symbol when provided', async () => {
        await app.request('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: validMessages, symbol: 'AAPL' }),
        })
        expect(mockGatewayChat).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: 'AAPL', channel: 'web' }),
        )
    })

    test('uppercases symbol before passing to gateway', async () => {
        await app.request('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: validMessages, symbol: 'aapl' }),
        })
        expect(mockGatewayChat).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: 'AAPL' }),
        )
    })

    test('returns 400 for missing messages', async () => {
        const res = await app.request('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
        expect(res.status).toBe(400)
    })

    test('returns 500 when gateway.chat throws', async () => {
        mockGatewayChat.mockRejectedValueOnce(new Error('AI provider timeout'))
        const res = await app.request('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: validMessages }),
        })
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.success).toBe(false)
    })
})
