import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Prisma } from '@prisma/client'
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
    updatedAt: Date
}

function createDb() {
    const rows = new Map<string, AgentRunRow>()
    let timestamp = new Date('2026-05-08T00:00:00.000Z').getTime()
    const nextUpdatedAt = () => {
        timestamp += 1
        return new Date(timestamp)
    }
    const touchRow = (id: string, data: Partial<AgentRunRow>) => {
        const existing = rows.get(id)
        if (!existing) throw new Error('not found')
        const updated = { ...existing, ...data, updatedAt: nextUpdatedAt() }
        rows.set(id, updated)
        return updated
    }
    const db = {
        agentRun: {
            create: mock(async ({ data }: { data: AgentRunRow }) => {
                if (rows.has(data.id)) {
                    throw Object.assign(
                        new Error('Unique constraint failed on AgentRun.id'),
                        { code: 'P2002' },
                    )
                }

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
                    updatedAt: data.updatedAt ?? nextUpdatedAt(),
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
                    return touchRow(where.id, data)
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
                        updatedAt?: Date
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
                            where.updatedAt &&
                            existing.updatedAt.getTime() !==
                                where.updatedAt.getTime()
                        ) {
                            continue
                        }
                        if (
                            where.startedAt?.lt &&
                            existing.startedAt >= where.startedAt.lt
                        ) {
                            continue
                        }
                        touchRow(id, data)
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
    return { db, rows, touchRow }
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
        const createData = fixture.db.agentRun.create.mock.calls[0]?.[0].data
        expect(createData?.error).toBe(Prisma.JsonNull)
        expect(createData?.usage).toBe(Prisma.JsonNull)
        expect(createData?.warnings).toBe(Prisma.JsonNull)
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
        const createData = fixture.db.agentRun.create.mock.calls[0]?.[0].data
        expect(createData?.usage).toBe(Prisma.JsonNull)
        expect(createData?.warnings).toBe(Prisma.JsonNull)
    })

    test('createFailedRun tolerates duplicate create races for missing rows', async () => {
        const originalFindUnique = fixture.db.agentRun.findUnique
        let findUniqueCalls = 0
        let resolveBothFindUnique: () => void = () => {}
        const bothFindUniqueCalls = new Promise<void>((resolve) => {
            resolveBothFindUnique = resolve
        })
        fixture.db.agentRun.findUnique = mock(
            async ({ where }: { where: { id: string } }) => {
                if (where.id !== 'run-race') {
                    return originalFindUnique({ where })
                }

                findUniqueCalls++
                if (findUniqueCalls === 2) resolveBothFindUnique()

                await bothFindUniqueCalls
                return null
            },
        )
        const store = createPrismaAgentRunStore(fixture.db as never)

        const first = store.createFailedRun({
            runId: 'run-race',
            source: 'cron',
            mode: 'trigger',
            agentType: 'trading-agent',
            error: new Error('first failure'),
        })
        const second = store.createFailedRun({
            runId: 'run-race',
            source: 'cron',
            mode: 'trigger',
            agentType: 'trading-agent',
            error: new Error('second failure'),
        })

        await expect(Promise.all([first, second])).resolves.toEqual([
            { runId: 'run-race' },
            { runId: 'run-race' },
        ])
        expect(fixture.db.agentRun.create).toHaveBeenCalledTimes(2)
        expect(fixture.rows.get('run-race')?.status).toBe('failed')
    })

    test('createFailedRun P2002 fallback computes duration from raced running row', async () => {
        const store = createPrismaAgentRunStore(fixture.db as never)
        const originalCreate = fixture.db.agentRun.create
        const runningStartedAt = new Date(Date.now() - 1234)

        fixture.db.agentRun.create = mock(
            async (input: { data: AgentRunRow }) => {
                if (input.data.id === 'run-running-race') {
                    fixture.rows.set('run-running-race', {
                        id: 'run-running-race',
                        status: 'running',
                        source: 'cron',
                        mode: 'trigger',
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
                        startedAt: runningStartedAt,
                        finishedAt: null,
                        durationMs: null,
                        updatedAt: new Date(),
                    })
                    throw Object.assign(
                        new Error('Unique constraint failed on AgentRun.id'),
                        { code: 'P2002' },
                    )
                }

                return originalCreate(input)
            },
        )

        await store.createFailedRun({
            runId: 'run-running-race',
            source: 'cron',
            mode: 'trigger',
            agentType: 'trading-agent',
            error: new Error('raced failure'),
        })

        const row = fixture.rows.get('run-running-race')
        expect(row?.status).toBe('failed')
        expect(row?.durationMs).toBe(
            row?.finishedAt
                ? row.finishedAt.getTime() - runningStartedAt.getTime()
                : null,
        )
        expect(row?.durationMs).toBeGreaterThan(0)
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

    test('succeedIfRunning writes JsonNull when usage is absent', async () => {
        const store = createPrismaAgentRunStore(fixture.db as never)
        await store.createRunningRun({
            runId: 'run-success',
            source: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
        })

        await store.succeedIfRunning('run-success', {
            messageId: 'msg-1',
            outputSummary: 'completed',
        })

        const updateCall = fixture.db.agentRun.updateMany.mock.calls.find(
            ([input]) =>
                input.where.id === 'run-success' &&
                input.data.status === 'succeeded',
        )
        expect(updateCall?.[0].data.usage).toBe(Prisma.JsonNull)
    })

    test('succeedIfRunning preserves existing messageId when omitted', async () => {
        const store = createPrismaAgentRunStore(fixture.db as never)
        await store.createRunningRun({
            runId: 'run-success-preserve-message',
            source: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            messageId: 'msg-existing',
        })

        await store.succeedIfRunning('run-success-preserve-message', {
            outputSummary: 'completed',
        })

        const row = fixture.rows.get('run-success-preserve-message')
        expect(row?.status).toBe('succeeded')
        expect(row?.messageId).toBe('msg-existing')
        const updateCall = fixture.db.agentRun.updateMany.mock.calls.find(
            ([input]) =>
                input.where.id === 'run-success-preserve-message' &&
                input.data.status === 'succeeded',
        )
        expect(updateCall?.[0].data).not.toHaveProperty('messageId')
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

    test('recordWarnings retries after a lost optimistic warning update', async () => {
        const store = createPrismaAgentRunStore(fixture.db as never)
        const initialWarning = {
            source: 'session.afterRun',
            message: 'manifest failed',
        }
        const concurrentWarning = {
            source: 'session.afterRun',
            message: 'rate limit warning',
        }
        const newWarning = {
            source: 'session.afterRun',
            message: 'tool skipped',
        }

        await store.createRunningRun({
            runId: 'run-warning-race',
            source: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
        })
        await store.recordWarnings('run-warning-race', [initialWarning])

        const originalUpdate = fixture.db.agentRun.update
        const originalUpdateMany = fixture.db.agentRun.updateMany
        let injectedConcurrentWarning = false
        const injectConcurrentWarning = () => {
            if (injectedConcurrentWarning) return

            const existing = fixture.rows.get('run-warning-race')
            if (!existing) throw new Error('missing run-warning-race fixture')
            const existingWarnings = Array.isArray(existing.warnings)
                ? existing.warnings
                : []
            fixture.touchRow('run-warning-race', {
                warnings: [...existingWarnings, concurrentWarning],
            })
            injectedConcurrentWarning = true
        }

        fixture.db.agentRun.update = mock(
            async (input: {
                where: { id: string }
                data: Partial<AgentRunRow>
            }) => {
                if (
                    input.where.id === 'run-warning-race' &&
                    'warnings' in input.data
                ) {
                    injectConcurrentWarning()
                }

                return originalUpdate(input)
            },
        )
        fixture.db.agentRun.updateMany = mock(
            async (input: {
                where: {
                    id?: string
                    status?: string
                    startedAt?: { lt: Date }
                    updatedAt?: Date
                }
                data: Partial<AgentRunRow>
            }) => {
                if (
                    input.where.id === 'run-warning-race' &&
                    input.where.updatedAt &&
                    'warnings' in input.data &&
                    !injectedConcurrentWarning
                ) {
                    injectConcurrentWarning()
                    return { count: 0 }
                }

                return originalUpdateMany(input)
            },
        )

        await store.recordWarnings('run-warning-race', [newWarning])

        expect(fixture.db.agentRun.updateMany).toHaveBeenCalledTimes(2)
        expect(fixture.rows.get('run-warning-race')?.warnings).toEqual([
            initialWarning,
            concurrentWarning,
            newWarning,
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
            updatedAt: new Date('2026-05-08T00:00:00.000Z'),
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
        expect(fixture.rows.get('old-running')?.durationMs).toBeNull()
        expect(fixture.rows.get('fresh-running')?.status).toBe('running')
        expect(fixture.rows.get('old-failed')?.status).toBe('failed')
        expect(fixture.rows.get('old-failed')?.error).toEqual({
            message: 'already failed',
            name: 'Error',
        })
    })
})
