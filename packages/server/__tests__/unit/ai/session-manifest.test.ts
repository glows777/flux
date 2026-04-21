import { describe, expect, it, mock } from 'bun:test'

if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
        'postgresql://test:test@localhost:5433/flux_test?schema=public'
}

import type { SessionDeps } from '@/core/ai/session'

function createMockDb() {
    return {
        chatMessageManifest: {
            upsert: mock(() => Promise.resolve({})),
            findUnique: mock(() => Promise.resolve(null)),
        },
    }
}

describe('saveMessageManifest', () => {
    it('upserts serialized row keyed by sessionId + messageId', async () => {
        const { saveMessageManifest } = await import('@/core/ai/session')
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps
        const manifest = {
            runId: 'run-1',
            createdAt: '2024-06-01T00:00:00.000Z',
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                initialSessionId: 'session-1',
                resolvedSessionId: 'session-1',
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
        }

        await saveMessageManifest('session-1', 'message-1', manifest as never, deps)

        expect(db.chatMessageManifest.upsert).toHaveBeenCalledTimes(1)
        expect(db.chatMessageManifest.upsert).toHaveBeenCalledWith({
            where: {
                sessionId_messageId: {
                    sessionId: 'session-1',
                    messageId: 'message-1',
                },
            },
            create: {
                sessionId: 'session-1',
                messageId: 'message-1',
                runId: 'run-1',
                manifest: JSON.stringify(manifest),
                version: 1,
            },
            update: {
                runId: 'run-1',
                manifest: JSON.stringify(manifest),
                version: 1,
            },
        })
    })
})

describe('loadMessageManifest', () => {
    it('returns null when absent', async () => {
        const { loadMessageManifest } = await import('@/core/ai/session')
        const db = createMockDb()

        const result = await loadMessageManifest(
            'session-1',
            'message-1',
            { db } as unknown as SessionDeps,
        )

        expect(result).toBeNull()
        expect(db.chatMessageManifest.findUnique).toHaveBeenCalledWith({
            where: {
                sessionId_messageId: {
                    sessionId: 'session-1',
                    messageId: 'message-1',
                },
            },
            select: {
                version: true,
                runId: true,
                manifest: true,
            },
        })
    })

    it('parses and returns the stored payload', async () => {
        const { loadMessageManifest } = await import('@/core/ai/session')
        const db = createMockDb()
        const manifest = {
            runId: 'run-2',
            createdAt: '2024-06-02T00:00:00.000Z',
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                initialSessionId: 'session-1',
                resolvedSessionId: 'session-1',
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
        }

        db.chatMessageManifest.findUnique = mock(() =>
            Promise.resolve({
                version: 1,
                runId: 'run-2',
                manifest: JSON.stringify(manifest),
            }),
        ) as typeof db.chatMessageManifest.findUnique

        const result = await loadMessageManifest(
            'session-1',
            'message-1',
            { db } as unknown as SessionDeps,
        )

        expect(result).toEqual({
            version: 1,
            runId: 'run-2',
            manifest,
        })
    })

    it('throws INVALID_INPUT when manifest JSON is malformed', async () => {
        const { loadMessageManifest, SessionError } = await import(
            '@/core/ai/session'
        )
        const db = createMockDb()
        db.chatMessageManifest.findUnique = mock(() =>
            Promise.resolve({
                version: 1,
                runId: 'run-3',
                manifest: '{not-valid-json',
            }),
        ) as typeof db.chatMessageManifest.findUnique

        try {
            await loadMessageManifest(
                'session-1',
                'message-1',
                { db } as unknown as SessionDeps,
            )
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })

    it('throws INVALID_INPUT when manifest JSON has an invalid shape', async () => {
        const { loadMessageManifest, SessionError } = await import(
            '@/core/ai/session'
        )
        const db = createMockDb()
        db.chatMessageManifest.findUnique = mock(() =>
            Promise.resolve({
                version: 1,
                runId: 'run-4',
                manifest: '{}',
            }),
        ) as typeof db.chatMessageManifest.findUnique

        try {
            await loadMessageManifest(
                'session-1',
                'message-1',
                { db } as unknown as SessionDeps,
            )
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })

    it('throws INVALID_INPUT when nested manifest sections are incomplete', async () => {
        const { loadMessageManifest, SessionError } = await import(
            '@/core/ai/session'
        )
        const db = createMockDb()
        db.chatMessageManifest.findUnique = mock(() =>
            Promise.resolve({
                version: 1,
                runId: 'run-5',
                manifest: JSON.stringify({
                    runId: 'run-5',
                    createdAt: '2024-06-03T00:00:00.000Z',
                    input: {
                        channel: 'web',
                    },
                    pluginOutputs: [],
                    assembledContext: {
                        segments: [],
                    },
                    modelRequest: {},
                }),
            }),
        ) as typeof db.chatMessageManifest.findUnique

        try {
            await loadMessageManifest(
                'session-1',
                'message-1',
                { db } as unknown as SessionDeps,
            )
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })
})
