import { describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import type { AgentRunTraceStore } from '@/core/ai/agent-run-trace'
import type { AgentRunTracePayload } from '@/core/ai/agent-run-trace/types'
import { createRunsRoutes } from '@/routes/runs'

function createPayload(runId: string): AgentRunTracePayload {
    return {
        version: 1,
        runId,
        traceStatus: 'complete',
        runOutcome: 'succeeded',
        currentPhase: 'after_run',
        completedPhases: ['created', 'after_run'],
        compaction: { applied: false, reason: 'not_implemented' },
        updatedAt: '2026-05-11T00:00:01.000Z',
    }
}

function createStore(
    record: Awaited<ReturnType<AgentRunTraceStore['loadRecordByRunId']>>,
) {
    return {
        createRecording: mock(async () => {}),
        mergeCheckpoint: mock(async () => {}),
        markIncomplete: mock(async () => {}),
        loadByRunId: mock(async () => record?.trace ?? null),
        loadRecordByRunId: mock(async () => record),
    } satisfies AgentRunTraceStore
}

function createApp(deps: {
    traceStore: AgentRunTraceStore
    isEnabled?: () => boolean
}) {
    return new Hono().basePath('/api').route('/runs', createRunsRoutes(deps))
}

describe('Run trace routes', () => {
    it('returns 404 when trace is missing', async () => {
        const store = createStore(null)
        const app = createApp({ traceStore: store, isEnabled: () => true })

        const res = await app.request('/api/runs/run-missing/trace')
        const json = await res.json()

        expect(res.status).toBe(404)
        expect(json).toEqual({
            success: false,
            error: 'Run trace not found',
        })
        expect(store.loadRecordByRunId).toHaveBeenCalledWith('run-missing')
    })

    it('returns run and trace when enabled and the trace exists', async () => {
        const startedAt = new Date('2026-05-11T01:02:03.000Z')
        const finishedAt = new Date('2026-05-11T01:02:09.000Z')
        const trace = createPayload('run-1')
        const store = createStore({
            run: {
                id: 'run-1',
                status: 'succeeded',
                source: 'chat',
                mode: 'conversation',
                agentType: 'trading',
                sessionId: 'session-1',
                messageId: 'message-1',
                cronJobId: null,
                inputSummary: 'input',
                outputSummary: 'output',
                error: null,
                warnings: null,
                startedAt,
                finishedAt,
                durationMs: 6000,
            },
            trace,
        })
        const app = createApp({ traceStore: store, isEnabled: () => true })

        const res = await app.request('/api/runs/run-1/trace')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json).toEqual({
            success: true,
            data: {
                run: {
                    id: 'run-1',
                    status: 'succeeded',
                    source: 'chat',
                    mode: 'conversation',
                    agentType: 'trading',
                    sessionId: 'session-1',
                    messageId: 'message-1',
                    cronJobId: null,
                    inputSummary: 'input',
                    outputSummary: 'output',
                    error: null,
                    warnings: null,
                    startedAt: '2026-05-11T01:02:03.000Z',
                    finishedAt: '2026-05-11T01:02:09.000Z',
                    durationMs: 6000,
                },
                trace,
            },
        })
    })

    it('returns 404 when the route is disabled', async () => {
        const store = createStore({
            run: {
                id: 'run-disabled',
                status: 'succeeded',
                source: 'chat',
                mode: 'conversation',
                agentType: 'trading',
                sessionId: null,
                messageId: null,
                cronJobId: null,
                inputSummary: null,
                outputSummary: null,
                error: null,
                warnings: null,
                startedAt: new Date('2026-05-11T01:02:03.000Z'),
                finishedAt: null,
                durationMs: null,
            },
            trace: createPayload('run-disabled'),
        })
        const app = createApp({ traceStore: store, isEnabled: () => false })

        const res = await app.request('/api/runs/run-disabled/trace')
        const json = await res.json()

        expect(res.status).toBe(404)
        expect(json).toEqual({
            success: false,
            error: 'Run trace not found',
        })
        expect(store.loadRecordByRunId).not.toHaveBeenCalled()
    })

    it('keeps the default route disabled unless trace API is explicitly enabled', async () => {
        const originalNodeEnv = process.env.NODE_ENV
        const originalEnableTraceApi = process.env.FLUX_ENABLE_TRACE_API
        delete process.env.NODE_ENV
        delete process.env.FLUX_ENABLE_TRACE_API

        try {
            const store = createStore({
                run: {
                    id: 'run-default-disabled',
                    status: 'succeeded',
                    source: 'chat',
                    mode: 'conversation',
                    agentType: 'trading',
                    sessionId: null,
                    messageId: null,
                    cronJobId: null,
                    inputSummary: null,
                    outputSummary: null,
                    error: null,
                    warnings: null,
                    startedAt: new Date('2026-05-11T01:02:03.000Z'),
                    finishedAt: null,
                    durationMs: null,
                },
                trace: createPayload('run-default-disabled'),
            })
            const app = createApp({ traceStore: store })

            const res = await app.request(
                '/api/runs/run-default-disabled/trace',
            )
            const json = await res.json()

            expect(res.status).toBe(404)
            expect(json).toEqual({
                success: false,
                error: 'Run trace not found',
            })
            expect(store.loadRecordByRunId).not.toHaveBeenCalled()
        } finally {
            if (originalNodeEnv === undefined) {
                delete process.env.NODE_ENV
            } else {
                process.env.NODE_ENV = originalNodeEnv
            }
            if (originalEnableTraceApi === undefined) {
                delete process.env.FLUX_ENABLE_TRACE_API
            } else {
                process.env.FLUX_ENABLE_TRACE_API = originalEnableTraceApi
            }
        }
    })
})
