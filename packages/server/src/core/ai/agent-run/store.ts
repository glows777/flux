import { Prisma } from '@prisma/client'

import { createRunId } from './id'
import type {
    AgentRunErrorRecord,
    AgentRunStatus,
    AgentRunStore,
    AgentRunWarning,
    CreateFailedRunInput,
    CreateRunningRunInput,
    FailRunInput,
    SucceedRunInput,
} from './types'

type AgentRunRow = {
    id: string
    status: AgentRunStatus | string
    startedAt: Date
    warnings?: unknown
    updatedAt?: Date
}

type AgentRunData = Record<string, unknown>

type AgentRunDelegate = {
    create(input: { data: AgentRunData }): Promise<unknown>
    update(input: {
        where: { id: string }
        data: AgentRunData
    }): Promise<unknown>
    updateMany(input: {
        where: {
            id?: string
            status?: AgentRunStatus
            startedAt?: { lt: Date }
            updatedAt?: Date
        }
        data: AgentRunData
    }): Promise<{ count: number }>
    findUnique(input: { where: { id: string } }): Promise<AgentRunRow | null>
}

export type AgentRunDb = {
    agentRun: AgentRunDelegate
}

function getStringProperty(value: unknown, key: string): string | undefined {
    if (!value || typeof value !== 'object') return undefined

    const property = (value as Record<string, unknown>)[key]
    return typeof property === 'string' ? property : undefined
}

function isUniqueConstraintError(error: unknown): boolean {
    return getStringProperty(error, 'code') === 'P2002'
}

function normalizeError(error: unknown, code?: string): AgentRunErrorRecord {
    const inferredCode = code ?? getStringProperty(error, 'code')

    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
            ...(inferredCode ? { code: inferredCode } : {}),
        }
    }

    const message = getStringProperty(error, 'message')
    const name = getStringProperty(error, 'name')

    if (message) {
        return {
            message,
            name: name ?? 'Error',
            ...(inferredCode ? { code: inferredCode } : {}),
        }
    }

    if (typeof error === 'string') {
        return {
            message: error,
            name: 'Error',
            ...(inferredCode ? { code: inferredCode } : {}),
        }
    }

    return {
        message: 'Unknown error',
        name: 'Error',
        ...(inferredCode ? { code: inferredCode } : {}),
    }
}

function trimText(value: string | undefined, max: number): string | null {
    if (value === undefined) return null
    return value.length > max ? value.slice(0, max) : value
}

function durationSince(
    startedAt: Date | undefined,
    finishedAt: Date,
): number | null {
    if (!(startedAt instanceof Date)) return null
    return Math.max(0, finishedAt.getTime() - startedAt.getTime())
}

function nullableRunFields(input: {
    sessionId?: string
    messageId?: string
    cronJobId?: string
    parentRunId?: string
    userId?: string
    sourceId?: string
}): AgentRunData {
    return {
        sessionId: input.sessionId ?? null,
        messageId: input.messageId ?? null,
        cronJobId: input.cronJobId ?? null,
        parentRunId: input.parentRunId ?? null,
        userId: input.userId ?? null,
        sourceId: input.sourceId ?? null,
    }
}

function definedRunFields(input: {
    sessionId?: string
    messageId?: string
    cronJobId?: string
    parentRunId?: string
    userId?: string
    sourceId?: string
}): AgentRunData {
    const data: AgentRunData = {}

    if (input.sessionId !== undefined) data.sessionId = input.sessionId
    if (input.messageId !== undefined) data.messageId = input.messageId
    if (input.cronJobId !== undefined) data.cronJobId = input.cronJobId
    if (input.parentRunId !== undefined) data.parentRunId = input.parentRunId
    if (input.userId !== undefined) data.userId = input.userId
    if (input.sourceId !== undefined) data.sourceId = input.sourceId

    return data
}

function mergeWarnings(
    existingWarnings: unknown,
    warnings: AgentRunWarning[],
): AgentRunWarning[] {
    if (!Array.isArray(existingWarnings)) return warnings

    return [
        ...existingWarnings.filter(
            (warning): warning is AgentRunWarning =>
                !!warning &&
                typeof warning === 'object' &&
                typeof (warning as AgentRunWarning).source === 'string' &&
                typeof (warning as AgentRunWarning).message === 'string',
        ),
        ...warnings,
    ]
}

const WARNING_UPDATE_ATTEMPTS = 3

export function createPrismaAgentRunStore(db: AgentRunDb): AgentRunStore {
    return {
        async createRunningRun(input: CreateRunningRunInput): Promise<void> {
            await db.agentRun.create({
                data: {
                    id: input.runId,
                    status: 'running',
                    source: input.source,
                    mode: input.mode,
                    agentType: input.agentType,
                    ...nullableRunFields(input),
                    inputSummary: trimText(input.inputSummary, 500),
                    outputSummary: null,
                    error: Prisma.JsonNull,
                    usage: Prisma.JsonNull,
                    warnings: Prisma.JsonNull,
                    startedAt: new Date(),
                    finishedAt: null,
                    durationMs: null,
                },
            })
        },

        async createFailedRun(
            input: CreateFailedRunInput,
        ): Promise<{ runId: string }> {
            const runId = input.runId ?? createRunId()
            const existing = await db.agentRun.findUnique({
                where: { id: runId },
            })
            const finishedAt = new Date()
            const error = normalizeError(input.error, input.code)
            const failedData: AgentRunData = {
                ...definedRunFields(input),
                status: 'failed',
                error,
                finishedAt,
            }

            if (existing) {
                if (existing.status === 'running') {
                    await db.agentRun.updateMany({
                        where: { id: runId, status: 'running' },
                        data: {
                            ...failedData,
                            durationMs: durationSince(
                                existing.startedAt,
                                finishedAt,
                            ),
                        },
                    })
                }

                return { runId }
            }

            try {
                await db.agentRun.create({
                    data: {
                        id: runId,
                        status: 'failed',
                        source: input.source,
                        mode: input.mode,
                        agentType: input.agentType,
                        ...nullableRunFields(input),
                        inputSummary: trimText(input.inputSummary, 500),
                        outputSummary: null,
                        error,
                        usage: Prisma.JsonNull,
                        warnings: Prisma.JsonNull,
                        startedAt: finishedAt,
                        finishedAt,
                        durationMs: 0,
                    },
                })
            } catch (createError) {
                if (!isUniqueConstraintError(createError)) throw createError

                const raced = await db.agentRun.findUnique({
                    where: { id: runId },
                })
                if (raced?.status === 'running') {
                    await db.agentRun.updateMany({
                        where: { id: runId, status: 'running' },
                        data: {
                            ...failedData,
                            durationMs: durationSince(
                                raced.startedAt,
                                finishedAt,
                            ),
                        },
                    })
                }
            }

            return { runId }
        },

        async attachSession(runId: string, sessionId: string): Promise<void> {
            const trimmedSessionId = sessionId.trim()
            if (!trimmedSessionId) return

            await db.agentRun.update({
                where: { id: runId },
                data: { sessionId: trimmedSessionId },
            })
        },

        async succeedIfRunning(
            runId: string,
            input: SucceedRunInput,
        ): Promise<void> {
            const existing = await db.agentRun.findUnique({
                where: { id: runId },
            })
            if (existing?.status !== 'running') return

            const finishedAt = new Date()
            const data: AgentRunData = {
                status: 'succeeded',
                outputSummary: trimText(input.outputSummary, 1000),
                usage: input.usage ?? Prisma.JsonNull,
                finishedAt,
                durationMs: durationSince(existing.startedAt, finishedAt),
            }
            if (input.messageId !== undefined) data.messageId = input.messageId

            await db.agentRun.updateMany({
                where: { id: runId, status: 'running' },
                data,
            })
        },

        async failIfRunning(runId: string, input: FailRunInput): Promise<void> {
            const existing = await db.agentRun.findUnique({
                where: { id: runId },
            })
            if (existing?.status !== 'running') return

            const finishedAt = new Date()
            await db.agentRun.updateMany({
                where: { id: runId, status: 'running' },
                data: {
                    status: 'failed',
                    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
                    error: normalizeError(input.error, input.code),
                    finishedAt,
                    durationMs: durationSince(existing.startedAt, finishedAt),
                },
            })
        },

        async recordWarnings(
            runId: string,
            warnings: AgentRunWarning[],
        ): Promise<void> {
            if (warnings.length === 0) return

            for (
                let attempt = 0;
                attempt < WARNING_UPDATE_ATTEMPTS;
                attempt++
            ) {
                const existing = await db.agentRun.findUnique({
                    where: { id: runId },
                })
                if (!existing) return

                const mergedWarnings = mergeWarnings(
                    existing.warnings,
                    warnings,
                )
                if (!(existing.updatedAt instanceof Date)) {
                    await db.agentRun.update({
                        where: { id: runId },
                        data: { warnings: mergedWarnings },
                    })
                    return
                }

                const result = await db.agentRun.updateMany({
                    where: { id: runId, updatedAt: existing.updatedAt },
                    data: { warnings: mergedWarnings },
                })
                if (result.count > 0) return
            }

            throw new Error(
                `Failed to record warnings for agent run ${runId} after ${WARNING_UPDATE_ATTEMPTS} concurrent update attempts.`,
            )
        },

        async reconcileStaleRunningRuns(input: {
            olderThan: Date
            reason?: string
        }): Promise<{ count: number }> {
            return db.agentRun.updateMany({
                where: {
                    status: 'running',
                    startedAt: { lt: input.olderThan },
                },
                data: {
                    status: 'failed',
                    error: {
                        message:
                            input.reason ??
                            'Agent run was reconciled because it remained running past the stale threshold.',
                        name: 'AgentRunReconciledError',
                        code: 'STALE_RUN_RECONCILED',
                    },
                    finishedAt: new Date(),
                },
            })
        },
    }
}
