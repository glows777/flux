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

        const createData = db.agentRunTrace.upsert.mock.calls[0]?.[0].create
        expect(JSON.stringify(createData.payload)).not.toContain('undefined')
    })
})
