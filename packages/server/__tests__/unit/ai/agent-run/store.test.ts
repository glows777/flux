import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { createPrismaAgentRunStore } from '@/core/ai/agent-run/store'

type AgentRunRow = {
    id: string
    status: string
    source: string
    mode: string
    agentType: string
    sessionId: string | null
    messageId: string | null
    cronJobId: string | null
    parentRunId: string | null
    userId: string | null
    sourceId: string | null
    inputSummary: string | null
    outputSummary: string | null
    error: unknown
    usage: unknown
    warnings: unknown
    startedAt: Date
    finishedAt: Date | null
    durationMs: number | null
}

function createDb() {
    const rows = new Map<string, AgentRunRow>()
    const db = {
        agentRun: {
            create: mock(async ({ data }: { data: AgentRunRow }) => {
                const startedAt = data.startedAt ?? new Date()
                rows.set(data.id, {
                    ...data,
                    startedAt,
                    sessionId: data.sessionId ?? null,
                    messageId: data.messageId ?? null,
                    cronJobId: data.cronJobId ?? null,
                    parentRunId: data.parentRunId ?? null,
                    userId: data.userId ?? null,
                    sourceId: data.sourceId ?? null,
                    inputSummary: data.inputSummary ?? null,
                    outputSummary: data.outputSummary ?? null,
                    error: data.error ?? null,
                    usage: data.usage ?? null,
                    warnings: data.warnings ?? null,
                    finishedAt: data.finishedAt ?? null,
                    durationMs: data.durationMs ?? null,
                })
                return rows.get(data.id)
            }),
            update: mock(
                async ({
                    where,
                    data,
                }: {
                    where: { id: string }
                    data: Partial<AgentRunRow>
                }) => {
                    const existing = rows.get(where.id)
                    if (!existing) throw new Error('not found')
                    rows.set(where.id, { ...existing, ...data })
                    return rows.get(where.id)
                },
            ),
            updateMany: mock(
                async ({
                    where,
                    data,
                }: {
                    where: {
                        id?: string
                        status?: string
                        startedAt?: { lt: Date }
                    }
                    data: Partial<AgentRunRow>
                }) => {
                    let count = 0
                    const entries = where.id
                        ? Array.from(rows.entries()).filter(
                              ([id]) => id === where.id,
                          )
                        : Array.from(rows.entries())

                    for (const [id, existing] of entries) {
                        if (where.status && existing.status !== where.status)
                            continue
                        if (
                            where.startedAt?.lt &&
                            existing.startedAt >= where.startedAt.lt
                        ) {
                            continue
                        }
                        rows.set(id, { ...existing, ...data })
                        count++
                    }

                    return { count }
                },
            ),
            findUnique: mock(
                async ({ where }: { where: { id: string } }) =>
                    rows.get(where.id) ?? null,
            ),
        },
    }
    return { db, rows }
}

describe('AgentRunStore', () => {
    let fixture: ReturnType<typeof createDb>

    beforeEach(() => {
        fixture = createDb()
    })

    test('createRunningRun writes a running run', async () => {
        const store = createPrismaAgentRunStore(fixture.db as never)

        await store.createRunningRun({
            runId: 'run-1',
            source: 'cron',
            mode: 'trigger',
            agentType: 'trading-agent',
            inputSummary: 'Check NVDA',
            userId: 'user-1',
            sourceId: 'cron:job-1',
            cronJobId: 'job-1',
        })

        expect(fixture.rows.get('run-1')?.status).toBe('running')
        expect(fixture.rows.get('run-1')?.cronJobId).toBe('job-1')
    })

    test('createFailedRun uses supplied run id', async () => {
        const store = createPrismaAgentRunStore(fixture.db as never)

        const result = await store.createFailedRun({
            runId: 'run-failed',
            source: 'cron',
            mode: 'trigger',
            agentType: 'trading-agent',
            error: new Error('missing prompt'),
        })

        expect(result.runId).toBe('run-failed')
        expect(fixture.rows.get('run-failed')?.status).toBe('failed')
        expect(fixture.rows.get('run-failed')?.error).toEqual({
            message: 'missing prompt',
            name: 'Error',
        })
    })

    test('terminal guards do not overwrite failed runs', async () => {
        const store = createPrismaAgentRunStore(fixture.db as never)
        await store.createFailedRun({
            runId: 'run-2',
            source: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            error: new Error('boom'),
        })

        await store.succeedIfRunning('run-2', {
            messageId: 'msg-1',
            outputSummary: 'late success',
            usage: { inputTokens: 1, outputTokens: 2 },
        })

        expect(fixture.rows.get('run-2')?.status).toBe('failed')
        expect(fixture.rows.get('run-2')?.messageId).toBeNull()
    })

    test('recordWarnings merges warnings', async () => {
        const store = createPrismaAgentRunStore(fixture.db as never)
        await store.createRunningRun({
            runId: 'run-3',
            source: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
        })

        await store.recordWarnings('run-3', [
            { source: 'session.afterRun', message: 'manifest failed' },
        ])
        await store.recordWarnings('run-3', [
            { source: 'session.afterRun', message: 'tool skipped' },
        ])

        expect(fixture.rows.get('run-3')?.warnings).toEqual([
            { source: 'session.afterRun', message: 'manifest failed' },
            { source: 'session.afterRun', message: 'tool skipped' },
        ])
    })

    test('createFailedRun updates running row and preserves terminal rows', async () => {
        const store = createPrismaAgentRunStore(fixture.db as never)
        await store.createRunningRun({
            runId: 'run-4',
            source: 'cron',
            mode: 'trigger',
            agentType: 'trading-agent',
            cronJobId: 'job-1',
        })

        await store.createFailedRun({
            runId: 'run-4',
            source: 'cron',
            mode: 'trigger',
            agentType: 'trading-agent',
            cronJobId: 'job-1',
            error: Object.assign(new Error('timed out'), { code: 'TIMEOUT' }),
        })

        expect(fixture.rows.get('run-4')?.status).toBe('failed')
        expect(fixture.rows.get('run-4')?.error).toEqual({
            message: 'timed out',
            name: 'Error',
            code: 'TIMEOUT',
        })

        await store.createFailedRun({
            runId: 'run-4',
            source: 'cron',
            mode: 'trigger',
            agentType: 'trading-agent',
            sessionId: 'session-late',
            messageId: 'msg-overwrite',
            error: Object.assign(new Error('late overwrite'), {
                code: 'OVERWRITE',
            }),
        })

        expect(fixture.rows.get('run-4')?.status).toBe('failed')
        expect(fixture.rows.get('run-4')?.sessionId).toBeNull()
        expect(fixture.rows.get('run-4')?.messageId).toBeNull()
        expect(fixture.rows.get('run-4')?.error).toEqual({
            message: 'timed out',
            name: 'Error',
            code: 'TIMEOUT',
        })

        await store.succeedIfRunning('run-4', {
            messageId: 'msg-late',
            outputSummary: 'late',
        })

        expect(fixture.rows.get('run-4')?.status).toBe('failed')
        expect(fixture.rows.get('run-4')?.messageId).toBeNull()
    })

    test('reconcileStaleRunningRuns only fails old running rows', async () => {
        const store = createPrismaAgentRunStore(fixture.db as never)
        const oldDate = new Date('2026-05-08T00:00:00.000Z')
        const freshDate = new Date('2026-05-08T01:00:00.000Z')
        fixture.rows.set('old-running', {
            id: 'old-running',
            status: 'running',
            source: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            sessionId: null,
            messageId: null,
            cronJobId: null,
            parentRunId: null,
            userId: null,
            sourceId: null,
            inputSummary: null,
            outputSummary: null,
            error: null,
            usage: null,
            warnings: null,
            startedAt: oldDate,
            finishedAt: null,
            durationMs: null,
        })
        const oldRunning = fixture.rows.get('old-running')
        if (!oldRunning) throw new Error('missing old running fixture')

        fixture.rows.set('fresh-running', {
            ...oldRunning,
            id: 'fresh-running',
            startedAt: freshDate,
        })
        fixture.rows.set('old-failed', {
            ...oldRunning,
            id: 'old-failed',
            status: 'failed',
            error: { message: 'already failed', name: 'Error' },
            startedAt: oldDate,
            finishedAt: oldDate,
            durationMs: 0,
        })

        const result = await store.reconcileStaleRunningRuns({
            olderThan: new Date('2026-05-08T00:30:00.000Z'),
        })

        expect(result.count).toBe(1)
        expect(fixture.rows.get('old-running')?.status).toBe('failed')
        expect(fixture.rows.get('fresh-running')?.status).toBe('running')
        expect(fixture.rows.get('old-failed')?.status).toBe('failed')
        expect(fixture.rows.get('old-failed')?.error).toEqual({
            message: 'already failed',
            name: 'Error',
        })
    })
})
