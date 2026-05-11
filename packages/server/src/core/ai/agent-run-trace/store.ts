import type { Prisma, PrismaClient } from '@prisma/client'
import {
    DEFAULT_TRACE_JSON_OPTIONS,
    measureTraceJsonBytes,
    sanitizeTraceJson,
} from './json'
import type { AgentRunTracePayload, TracePhase, TraceStatus } from './types'

type TraceRow = {
    runId: string
    status: string
    phase: string
    payload: unknown
    updatedAt?: Date
}

type AgentRunSummaryRow = {
    id: string
    status: string
    source: string
    mode: string
    agentType: string
    sessionId: string | null
    messageId: string | null
    cronJobId: string | null
    inputSummary: string | null
    outputSummary: string | null
    error: unknown
    warnings: unknown
    startedAt: Date
    finishedAt: Date | null
    durationMs: number | null
}

type TraceDelegate = {
    create(input: {
        data: {
            runId: string
            status: string
            phase: string
            payload: unknown
        }
    }): Promise<TraceRow>
    upsert(input: {
        where: { runId: string }
        create: {
            runId: string
            status: string
            phase: string
            payload: unknown
        }
        update: { status: string; phase: string; payload: unknown }
    }): Promise<TraceRow>
    findUnique(input: { where: { runId: string } }): Promise<TraceRow | null>
    updateMany(input: {
        where: { runId: string; updatedAt?: Date }
        data: { status: string; phase: string; payload: unknown }
    }): Promise<{ count: number }>
}

export type AgentRunTraceDb = Pick<PrismaClient, 'agentRunTrace'> & {
    agentRunTrace: TraceDelegate
    agentRun: {
        findUnique(input: {
            where: { id: string }
            select: Record<string, boolean>
        }): Promise<AgentRunSummaryRow | null>
    }
}

export interface TraceCheckpointInput {
    status: TraceStatus
    phase: TracePhase
    patch: Partial<AgentRunTracePayload>
}

export interface AgentRunTraceStore {
    createRecording(payload: AgentRunTracePayload): Promise<void>
    mergeCheckpoint(runId: string, input: TraceCheckpointInput): Promise<void>
    markIncomplete(runId: string, error: unknown): Promise<void>
    loadByRunId(runId: string): Promise<AgentRunTracePayload | null>
    loadRecordByRunId(runId: string): Promise<{
        run: AgentRunSummaryRow
        trace: AgentRunTracePayload
    } | null>
}

const MERGE_ATTEMPTS = 3
const MAX_TRACE_PAYLOAD_BYTES = 512 * 1024

function isUniqueConstraintError(error: unknown): boolean {
    return (error as { code?: unknown } | null)?.code === 'P2002'
}

function asPayload(value: unknown): AgentRunTracePayload | null {
    if (!value || typeof value !== 'object') return null

    const record = value as Partial<AgentRunTracePayload>
    return record.version === 1 && typeof record.runId === 'string'
        ? (record as AgentRunTracePayload)
        : null
}

function mergePayload(
    existing: AgentRunTracePayload,
    phase: TracePhase,
    patch: Partial<AgentRunTracePayload>,
): AgentRunTracePayload {
    const completed = new Set(existing.completedPhases)
    completed.add(phase)

    return {
        ...existing,
        ...patch,
        currentPhase: phase,
        completedPhases: Array.from(completed),
        traceStatus: patch.traceStatus ?? existing.traceStatus,
        runOutcome: patch.runOutcome ?? existing.runOutcome,
        warnings: patch.warnings ?? existing.warnings,
        cache: patch.cache
            ? { ...existing.cache, ...patch.cache }
            : existing.cache,
        updatedAt: new Date().toISOString(),
    }
}

function isPlainObject(value: object): boolean {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

function stripUndefinedObjectFields(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) =>
            item === undefined ? null : stripUndefinedObjectFields(item),
        )
    }
    if (!value || typeof value !== 'object') return value
    if (!isPlainObject(value)) return value

    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
        if (item === undefined) continue
        result[key] = stripUndefinedObjectFields(item)
    }
    return result
}

function normalizePayloadForStorage(
    payload: AgentRunTracePayload,
): AgentRunTracePayload {
    const safe = sanitizeTraceJson(stripUndefinedObjectFields(payload), {
        ...DEFAULT_TRACE_JSON_OPTIONS,
        maxBytes: MAX_TRACE_PAYLOAD_BYTES,
        maxDepth: 32,
        maxArrayItems: 10_000,
        maxStringBytes: MAX_TRACE_PAYLOAD_BYTES,
    })
    if (!safe.value || typeof safe.value !== 'object') {
        throw Object.assign(
            new Error('Trace payload normalized to non-object'),
            {
                code: 'TRACE_PAYLOAD_INVALID',
            },
        )
    }
    return safe.value as AgentRunTracePayload
}

function assertPayloadFits(payload: AgentRunTracePayload): void {
    const size = measureTraceJsonBytes(payload)
    if (size > MAX_TRACE_PAYLOAD_BYTES) {
        throw Object.assign(
            new Error(
                `Agent run trace payload exceeds ${MAX_TRACE_PAYLOAD_BYTES} bytes`,
            ),
            { code: 'TRACE_PAYLOAD_TOO_LARGE' },
        )
    }
}

function toPrismaJson(payload: AgentRunTracePayload): Prisma.InputJsonValue {
    return normalizePayloadForStorage(
        payload,
    ) as unknown as Prisma.InputJsonValue
}

function shouldKeepExistingCompletedFailure(
    existing: AgentRunTracePayload,
    payload: AgentRunTracePayload,
): boolean {
    return Boolean(
        existing.traceStatus === 'complete' &&
            existing.runOutcome === 'failed' &&
            existing.failure &&
            payload.failure,
    )
}

export function createPrismaAgentRunTraceStore(
    db: AgentRunTraceDb,
): AgentRunTraceStore {
    return {
        async createRecording(payload) {
            assertPayloadFits(payload)

            for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt++) {
                const existing = await db.agentRunTrace.findUnique({
                    where: { runId: payload.runId },
                })
                const existingPayload = asPayload(existing?.payload)
                if (existingPayload) {
                    return
                }

                const storedPayload = toPrismaJson(payload)
                if (existing) {
                    const result = await db.agentRunTrace.updateMany({
                        where: {
                            runId: payload.runId,
                            ...(existing.updatedAt
                                ? { updatedAt: existing.updatedAt }
                                : {}),
                        },
                        data: {
                            status: payload.traceStatus,
                            phase: payload.currentPhase,
                            payload: storedPayload,
                        },
                    })
                    if (result.count > 0) return
                    continue
                }

                try {
                    await db.agentRunTrace.create({
                        data: {
                            runId: payload.runId,
                            status: payload.traceStatus,
                            phase: payload.currentPhase,
                            payload: storedPayload,
                        },
                    })
                    return
                } catch (error) {
                    if (isUniqueConstraintError(error)) continue
                    throw error
                }
            }

            throw new Error(
                `Failed to create agent run trace ${payload.runId} after ${MERGE_ATTEMPTS} attempts`,
            )
        },

        async mergeCheckpoint(runId, input) {
            for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt++) {
                const row = await db.agentRunTrace.findUnique({
                    where: { runId },
                })
                const existing = asPayload(row?.payload)
                if (!existing) {
                    throw new Error(`AgentRunTrace ${runId} does not exist`)
                }
                if (existing.traceStatus !== 'recording') {
                    return
                }

                const payload = mergePayload(existing, input.phase, {
                    ...input.patch,
                    traceStatus: input.status,
                })

                if (
                    existing.traceStatus === 'complete' &&
                    existing.runOutcome === 'succeeded' &&
                    payload.runOutcome === 'failed'
                ) {
                    return
                }
                if (shouldKeepExistingCompletedFailure(existing, payload)) {
                    return
                }

                assertPayloadFits(payload)
                const result = await db.agentRunTrace.updateMany({
                    where: {
                        runId,
                        ...(row?.updatedAt ? { updatedAt: row.updatedAt } : {}),
                    },
                    data: {
                        status: payload.traceStatus,
                        phase: payload.currentPhase,
                        payload: toPrismaJson(payload),
                    },
                })
                if (result.count > 0) return
            }

            throw new Error(
                `Failed to merge agent run trace ${runId} after ${MERGE_ATTEMPTS} attempts`,
            )
        },

        async markIncomplete(runId, error) {
            for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt++) {
                const row = await db.agentRunTrace.findUnique({
                    where: { runId },
                })
                const existing = asPayload(row?.payload)
                if (!existing) return
                if (existing.traceStatus !== 'recording') return

                const code = (error as { code?: unknown } | null)?.code
                const payload: AgentRunTracePayload = {
                    ...existing,
                    traceStatus: 'incomplete',
                    recordingError: {
                        message:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        ...(typeof code === 'string' ? { code } : {}),
                        occurredAt: new Date().toISOString(),
                    },
                    updatedAt: new Date().toISOString(),
                }

                assertPayloadFits(payload)
                const result = await db.agentRunTrace.updateMany({
                    where: {
                        runId,
                        ...(row?.updatedAt ? { updatedAt: row.updatedAt } : {}),
                    },
                    data: {
                        status: payload.traceStatus,
                        phase: payload.currentPhase,
                        payload: toPrismaJson(payload),
                    },
                })
                if (result.count > 0) return
            }
        },

        async loadByRunId(runId) {
            const row = await db.agentRunTrace.findUnique({ where: { runId } })
            return asPayload(row?.payload)
        },

        async loadRecordByRunId(runId) {
            const [traceRow, run] = await Promise.all([
                db.agentRunTrace.findUnique({ where: { runId } }),
                db.agentRun.findUnique({
                    where: { id: runId },
                    select: {
                        id: true,
                        status: true,
                        source: true,
                        mode: true,
                        agentType: true,
                        sessionId: true,
                        messageId: true,
                        cronJobId: true,
                        inputSummary: true,
                        outputSummary: true,
                        error: true,
                        warnings: true,
                        startedAt: true,
                        finishedAt: true,
                        durationMs: true,
                    },
                }),
            ])
            const trace = asPayload(traceRow?.payload)
            return run && trace ? { run, trace } : null
        },
    }
}
