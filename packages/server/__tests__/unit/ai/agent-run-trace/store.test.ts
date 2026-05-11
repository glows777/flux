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

    test('createRecording retries after one optimistic update conflict', async () => {
        const { db, rows } = createDb()
        const store = createPrismaAgentRunTraceStore(db as never)
        rows.set('run-1', {
            runId: 'run-1',
            status: 'recording',
            phase: 'created',
            payload: createPayload('run-1'),
            updatedAt: new Date('2026-05-11T00:00:00.000Z'),
        })
        const originalUpdateMany = db.agentRunTrace.updateMany
        db.agentRunTrace.updateMany = mock(async (input) => {
            if (db.agentRunTrace.updateMany.mock.calls.length === 1) {
                return { count: 0 }
            }
            return originalUpdateMany(input)
        })

        await store.createRecording({
            ...createPayload('run-1'),
            updatedAt: '2026-05-11T00:00:02.000Z',
        })

        expect(db.agentRunTrace.updateMany).toHaveBeenCalledTimes(2)
        expect(rows.get('run-1')?.payload.updatedAt).toBe(
            '2026-05-11T00:00:02.000Z',
        )
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
})
