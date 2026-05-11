import { describe, expect, mock, test } from 'bun:test'
import { createPrismaAgentRunTraceStore } from '@/core/ai/agent-run-trace/store'
import type { AgentRunTracePayload } from '@/core/ai/agent-run-trace/types'

function createPayload(runId: string): AgentRunTracePayload {
    return {
        version: 1,
        runId,
        traceStatus: 'recording',
        runOutcome: 'unknown',
        currentPhase: 'created',
        completedPhases: [],
        compaction: { applied: false, reason: 'not_implemented' },
        updatedAt: '2026-05-11T00:00:00.000Z',
    }
}

function createDb() {
    const rows = new Map<
        string,
        {
            runId: string
            status: string
            phase: string
            payload: AgentRunTracePayload
            updatedAt: Date
        }
    >()
    const db = {
        agentRunTrace: {
            create: mock(async ({ data }) => {
                if (rows.has(data.runId)) {
                    throw Object.assign(new Error('Unique constraint failed'), {
                        code: 'P2002',
                    })
                }
                const next = {
                    runId: data.runId,
                    status: data.status,
                    phase: data.phase,
                    payload: data.payload,
                    updatedAt: new Date(),
                }
                rows.set(data.runId, next)
                return next
            }),
            upsert: mock(async ({ where, create, update }) => {
                const existing = rows.get(where.runId)
                const next = existing
                    ? { ...existing, ...update, updatedAt: new Date() }
                    : {
                          runId: create.runId,
                          status: create.status,
                          phase: create.phase,
                          payload: create.payload,
                          updatedAt: new Date(),
                      }
                rows.set(where.runId, next)
                return next
            }),
            findUnique: mock(
                async ({ where }) => rows.get(where.runId) ?? null,
            ),
            updateMany: mock(async ({ where, data }) => {
                const existing = rows.get(where.runId)
                if (!existing) return { count: 0 }
                if (
                    where.updatedAt &&
                    existing.updatedAt.getTime() !== where.updatedAt.getTime()
                ) {
                    return { count: 0 }
                }
                rows.set(where.runId, {
                    ...existing,
                    ...data,
                    updatedAt: new Date(),
                })
                return { count: 1 }
            }),
        },
        agentRun: {
            findUnique: mock(async () => null),
        },
    }
    return { db, rows }
}

describe('AgentRunTraceStore', () => {
    test('creates a recording trace', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-1'))

        expect(rows.get('run-1')?.status).toBe('recording')
        expect(rows.get('run-1')?.phase).toBe('created')
    })

    test('createRecording does not overwrite an existing complete trace', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-1'))
        await store.mergeCheckpoint('run-1', {
            status: 'complete',
            phase: 'after_run',
            patch: { runOutcome: 'succeeded' },
        })

        await store.createRecording({
            ...createPayload('run-1'),
            updatedAt: '2026-05-11T00:00:02.000Z',
        })

        expect(rows.get('run-1')?.payload.traceStatus).toBe('complete')
        expect(rows.get('run-1')?.payload.runOutcome).toBe('succeeded')
        expect(rows.get('run-1')?.payload.currentPhase).toBe('after_run')
    })

    test('createRecording does not overwrite an existing recording trace', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-1'))
        await store.mergeCheckpoint('run-1', {
            status: 'recording',
            phase: 'assemble_context',
            patch: {
                prompt: {
                    finalInput: {
                        systemText: 'preserve me',
                        modelMessages: [],
                        tools: [],
                        params: { resolved: {}, candidates: [] },
                    },
                    segments: [],
                    totalEstimatedInputTokens: 0,
                },
            },
        })

        await store.createRecording({
            ...createPayload('run-1'),
            updatedAt: '2026-05-11T00:00:02.000Z',
        })

        const payload = rows.get('run-1')?.payload
        expect(payload?.currentPhase).toBe('assemble_context')
        expect(payload?.prompt?.finalInput.systemText).toBe('preserve me')
    })

    test('merges checkpoint payload without dropping existing sections', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-1'))
        await store.mergeCheckpoint('run-1', {
            status: 'recording',
            phase: 'assemble_context',
            patch: {
                prompt: {
                    finalInput: {
                        systemText: 'sys',
                        modelMessages: [],
                        tools: [],
                        params: { resolved: {}, candidates: [] },
                    },
                    segments: [],
                    totalEstimatedInputTokens: 0,
                },
            },
        })
        await store.mergeCheckpoint('run-1', {
            status: 'complete',
            phase: 'after_run',
            patch: { runOutcome: 'succeeded' },
        })

        const payload = rows.get('run-1')?.payload
        expect(payload?.prompt?.finalInput.systemText).toBe('sys')
        expect(payload?.traceStatus).toBe('complete')
        expect(payload?.runOutcome).toBe('succeeded')
        expect(payload?.completedPhases).toContain('assemble_context')
        expect(payload?.completedPhases).toContain('after_run')
    })

    test('does not overwrite a completed succeeded trace with a late failure', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-1'))
        await store.mergeCheckpoint('run-1', {
            status: 'complete',
            phase: 'after_run',
            patch: { runOutcome: 'succeeded' },
        })
        await store.mergeCheckpoint('run-1', {
            status: 'complete',
            phase: 'model_stream',
            patch: {
                runOutcome: 'failed',
                failure: {
                    phase: 'model_stream',
                    error: { message: 'late timeout' },
                    occurredAt: '2026-05-11T00:00:01.000Z',
                },
            },
        })

        expect(rows.get('run-1')?.payload.runOutcome).toBe('succeeded')
        expect(rows.get('run-1')?.payload.failure).toBeUndefined()
    })

    test('does not regress a completed trace with a late recording checkpoint', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-1'))
        await store.mergeCheckpoint('run-1', {
            status: 'complete',
            phase: 'after_run',
            patch: { runOutcome: 'succeeded' },
        })

        await store.mergeCheckpoint('run-1', {
            status: 'recording',
            phase: 'finalize',
            patch: {
                result: {
                    finalOutput: { text: 'late', textHash: 'hash' },
                    usage: {},
                    provider: { id: 'mock' },
                },
            },
        })

        const payload = rows.get('run-1')?.payload
        expect(payload?.traceStatus).toBe('complete')
        expect(payload?.runOutcome).toBe('succeeded')
        expect(payload?.currentPhase).toBe('after_run')
        expect(payload?.result).toBeUndefined()
    })

    test('does not overwrite a completed detailed failure with a later minimal failure', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-1'))
        await store.mergeCheckpoint('run-1', {
            status: 'complete',
            phase: 'model_stream',
            patch: {
                runOutcome: 'failed',
                failure: {
                    phase: 'model_stream',
                    sourcePlugin: 'runtime-plugin',
                    error: { message: 'provider failed' },
                    occurredAt: '2026-05-11T00:00:01.000Z',
                },
            },
        })
        await store.mergeCheckpoint('run-1', {
            status: 'complete',
            phase: 'before_run',
            patch: {
                runOutcome: 'failed',
                failure: {
                    phase: 'before_run',
                    source: 'cron_executor',
                    error: { message: 'timeout' },
                    occurredAt: '2026-05-11T00:00:02.000Z',
                },
            },
        })

        expect(rows.get('run-1')?.payload.failure?.error.message).toBe(
            'provider failed',
        )
    })

    test('markIncomplete preserves current phase and completed phases', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-1'))
        await store.mergeCheckpoint('run-1', {
            status: 'recording',
            phase: 'model_stream',
            patch: {},
        })

        await store.markIncomplete('run-1', new Error('trace failed'))

        const payload = rows.get('run-1')?.payload
        expect(payload?.traceStatus).toBe('incomplete')
        expect(payload?.currentPhase).toBe('model_stream')
        expect(payload?.completedPhases).toEqual(['model_stream'])
        expect(payload?.recordingError?.message).toBe('trace failed')
    })

    test('markIncomplete is a no-op for a completed trace', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-1'))
        await store.mergeCheckpoint('run-1', {
            status: 'complete',
            phase: 'after_run',
            patch: { runOutcome: 'succeeded' },
        })

        await store.markIncomplete('run-1', new Error('trace failed'))

        const payload = rows.get('run-1')?.payload
        expect(payload?.traceStatus).toBe('complete')
        expect(payload?.runOutcome).toBe('succeeded')
        expect(payload?.recordingError).toBeUndefined()
    })

    test('does not overwrite an incomplete trace with a late checkpoint', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-1'))
        await store.mergeCheckpoint('run-1', {
            status: 'recording',
            phase: 'model_stream',
            patch: {},
        })
        await store.markIncomplete('run-1', new Error('trace failed'))

        await store.mergeCheckpoint('run-1', {
            status: 'complete',
            phase: 'after_run',
            patch: { runOutcome: 'succeeded' },
        })

        const payload = rows.get('run-1')?.payload
        expect(payload?.traceStatus).toBe('incomplete')
        expect(payload?.currentPhase).toBe('model_stream')
        expect(payload?.runOutcome).toBe('unknown')
    })

    test('normalizes undefined payload fields before writing Prisma JSON', async () => {
        const { db } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording({
            ...createPayload('run-no-undef'),
            result: {
                finalOutput: {
                    text: 'done',
                    textHash: 'hash',
                    messageId: undefined,
                },
                usage: {},
                provider: { id: 'unknown', modelId: undefined },
            },
        } as never)

        const createData = db.agentRunTrace.create.mock.calls[0]?.[0].data
        expect(JSON.stringify(createData.payload)).not.toContain('undefined')
    })

    test('normalization preserves built-ins until sanitizer handles them', async () => {
        const { db } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        const error = Object.assign(new Error('provider failed'), {
            code: 'PROVIDER_ERROR',
        })

        await store.createRecording({
            ...createPayload('run-built-ins'),
            warnings: [
                {
                    code: 'metadata',
                    message: 'provider metadata',
                    data: {
                        seenAt: new Date('2026-05-11T00:00:00.000Z'),
                        labels: new Map([
                            ['region', 'us'],
                            ['token', 'secret'],
                        ]),
                        error,
                        skipped: undefined,
                    },
                },
            ],
        } as never)

        const createData = db.agentRunTrace.create.mock.calls[0]?.[0].data
        const data = createData.payload.warnings[0].data
        expect(data.seenAt).toEqual({
            type: 'Date',
            value: '2026-05-11T00:00:00.000Z',
        })
        expect(data.labels).toEqual({
            type: 'Map',
            entries: [
                ['region', 'us'],
                ['token', '[Redacted]'],
            ],
        })
        expect(data.error).toEqual(
            expect.objectContaining({
                name: 'Error',
                message: 'provider failed',
                code: 'PROVIDER_ERROR',
            }),
        )
        expect(data.skipped).toBeUndefined()
    })

    test('normalizes oversized checkpoint payload before enforcing the storage cap', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-oversized'))

        const longText = 'x'.repeat(600 * 1024)

        await expect(
            store.mergeCheckpoint('run-oversized', {
                status: 'recording',
                phase: 'assemble_context',
                patch: {
                    prompt: {
                        finalInput: {
                            systemText: longText,
                            modelMessages: [
                                { role: 'user', content: longText },
                            ],
                            tools: [],
                            params: { resolved: {}, candidates: [] },
                        },
                        segments: [],
                        totalEstimatedInputTokens: 42,
                    },
                },
            }),
        ).resolves.toBeUndefined()

        const payload = rows.get('run-oversized')?.payload
        expect(payload?.prompt?.totalEstimatedInputTokens).toBe(42)
        expect(payload?.prompt?.finalInput.systemText).toContain(
            '[Truncated string from',
        )
        expect(JSON.stringify(payload).length).toBeLessThan(512 * 1024)
    })

    test('stores a compact fallback when many short items keep the trace oversized', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-many-items'))

        const modelMessages = Array.from({ length: 12_000 }, (_, index) => ({
            role: 'user',
            content: `message-${index}-${'x'.repeat(120)}`,
        }))

        await expect(
            store.mergeCheckpoint('run-many-items', {
                status: 'recording',
                phase: 'assemble_context',
                patch: {
                    prompt: {
                        finalInput: {
                            systemText: 'sys',
                            modelMessages,
                            tools: [],
                            params: { resolved: {}, candidates: [] },
                        },
                        segments: [],
                        totalEstimatedInputTokens: 84,
                    },
                },
            }),
        ).resolves.toBeUndefined()

        const payload = rows.get('run-many-items')?.payload
        expect(payload?.prompt?.totalEstimatedInputTokens).toBe(84)
        expect(payload?.prompt?.finalInput.modelMessages).toHaveLength(0)
        expect(JSON.stringify(payload).length).toBeLessThan(512 * 1024)
    })

    test('compact fallback still redacts secret-shaped strings', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-fallback-secret'))

        const modelMessages = Array.from({ length: 12_000 }, (_, index) => ({
            role: 'user',
            content: `message-${index}-${'x'.repeat(120)}`,
        }))

        await expect(
            store.mergeCheckpoint('run-fallback-secret', {
                status: 'complete',
                phase: 'model_stream',
                patch: {
                    runOutcome: 'failed',
                    prompt: {
                        finalInput: {
                            systemText: 'Authorization: Bearer sk-secret-value',
                            modelMessages,
                            tools: [],
                            params: { resolved: {}, candidates: [] },
                        },
                        segments: [],
                        totalEstimatedInputTokens: 84,
                    },
                    result: {
                        finalOutput: {
                            text: 'api_key=sk-result-value',
                            textHash: 'hash-result',
                        },
                        usage: {},
                        provider: { id: 'openai' },
                    },
                    failure: {
                        phase: 'model_stream',
                        source: 'runtime',
                        error: {
                            message: 'password=hunter2',
                            name: 'ProviderError',
                        },
                        occurredAt: '2026-05-11T00:00:02.000Z',
                    },
                },
            }),
        ).resolves.toBeUndefined()

        const serialized = JSON.stringify(
            rows.get('run-fallback-secret')?.payload,
        )
        expect(serialized).not.toContain('sk-secret-value')
        expect(serialized).not.toContain('sk-result-value')
        expect(serialized).not.toContain('hunter2')
        expect(serialized).toContain('[Redacted]')
    })

    test('compact fallback preserves bounded success result, cache, and tool evidence', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-final-success'))

        const modelMessages = Array.from({ length: 12_000 }, (_, index) => ({
            role: 'user',
            content: `message-${index}-${'x'.repeat(120)}`,
        }))

        await expect(
            store.mergeCheckpoint('run-final-success', {
                status: 'complete',
                phase: 'after_run',
                patch: {
                    runOutcome: 'succeeded',
                    prompt: {
                        finalInput: {
                            systemText: 'sys',
                            modelMessages,
                            tools: [],
                            params: { resolved: {}, candidates: [] },
                        },
                        segments: [],
                        totalEstimatedInputTokens: 84,
                    },
                    tools: {
                        available: [
                            {
                                name: 'quote',
                                sourcePlugin: 'market',
                                category: 'data',
                            },
                        ],
                        calls: [],
                    },
                    cache: {
                        result: {
                            cacheObserved: true,
                            evidenceSource: 'both',
                            cacheReadObserved: true,
                            cacheWriteObserved: false,
                            cacheReadEvidenceSource: 'providerMetadata',
                            cacheWriteEvidenceSource: 'none',
                            cacheReadTokens: 32,
                            rolloutGateStatus: 'enabled',
                            circuitBreakerState: 'closed',
                        },
                    },
                    result: {
                        finalOutput: {
                            text: 'done',
                            textHash: 'hash-done',
                            messageId: 'assistant-1',
                        },
                        usage: {
                            inputTokens: 10,
                            outputTokens: 5,
                            totalTokens: 15,
                        },
                        provider: { id: 'openai', modelId: 'gpt-test' },
                    },
                },
            }),
        ).resolves.toBeUndefined()

        const payload = rows.get('run-final-success')?.payload
        expect(payload?.runOutcome).toBe('succeeded')
        expect(payload?.result?.finalOutput).toEqual({
            text: 'done',
            textHash: 'hash-done',
            messageId: 'assistant-1',
        })
        expect(payload?.result?.usage).toEqual({
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
        })
        expect(payload?.result?.provider).toEqual({
            id: 'openai',
            modelId: 'gpt-test',
        })
        expect(payload?.cache?.result?.cacheReadTokens).toBe(32)
        expect(payload?.tools?.available).toEqual([
            { name: 'quote', sourcePlugin: 'market', category: 'data' },
        ])
        expect(JSON.stringify(payload).length).toBeLessThan(512 * 1024)
    })

    test('compact fallback preserves bounded terminal failure details', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        await store.createRecording(createPayload('run-final-failure'))

        const modelMessages = Array.from({ length: 12_000 }, (_, index) => ({
            role: 'user',
            content: `message-${index}-${'x'.repeat(120)}`,
        }))

        await expect(
            store.mergeCheckpoint('run-final-failure', {
                status: 'complete',
                phase: 'model_stream',
                patch: {
                    runOutcome: 'failed',
                    prompt: {
                        finalInput: {
                            systemText: 'sys',
                            modelMessages,
                            tools: [],
                            params: { resolved: {}, candidates: [] },
                        },
                        segments: [],
                        totalEstimatedInputTokens: 84,
                    },
                    failure: {
                        phase: 'model_stream',
                        source: 'runtime',
                        error: {
                            message: 'provider failed',
                            name: 'ProviderError',
                            code: 'PROVIDER_FAILED',
                            stack: 'stack line',
                        },
                        occurredAt: '2026-05-11T00:00:02.000Z',
                    },
                },
            }),
        ).resolves.toBeUndefined()

        const payload = rows.get('run-final-failure')?.payload
        expect(payload?.runOutcome).toBe('failed')
        expect(payload?.failure).toEqual({
            phase: 'model_stream',
            source: 'runtime',
            error: {
                message: 'provider failed',
                name: 'ProviderError',
                code: 'PROVIDER_FAILED',
                stack: 'stack line',
            },
            occurredAt: '2026-05-11T00:00:02.000Z',
        })
        expect(JSON.stringify(payload).length).toBeLessThan(512 * 1024)
    })
})
