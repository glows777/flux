import type { Prisma, PrismaClient } from '@prisma/client'
import {
    DEFAULT_TRACE_JSON_OPTIONS,
    measureTraceJsonBytes,
    sanitizeTraceJson,
    truncateTraceText,
} from './json'
import type {
    AgentRunTracePayload,
    CacheResultTrace,
    CompactionTrace,
    FailureTrace,
    ResultTrace,
    ToolTrace,
    TracePhase,
    TraceStatus,
} from './types'

const AGENT_RUN_TRACE_RUN_SELECT = {
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
} as const

type TraceRow = {
    runId: string
    status: string
    phase: string
    payload: unknown
    updatedAt?: Date
}

type AgentRunSummaryRow = Prisma.AgentRunGetPayload<{
    select: typeof AGENT_RUN_TRACE_RUN_SELECT
}>

type TraceDelegate = {
    create(input: {
        data: {
            runId: string
            status: string
            phase: string
            payload: Prisma.InputJsonValue
        }
    }): Promise<TraceRow>
    findUnique(input: { where: { runId: string } }): Promise<TraceRow | null>
    updateMany(input: {
        where: { runId: string; updatedAt?: Date }
        data: { status: string; phase: string; payload: Prisma.InputJsonValue }
    }): Promise<{ count: number }>
}

export type AgentRunTraceDb = Pick<PrismaClient, 'agentRunTrace'> & {
    agentRunTrace: TraceDelegate
    agentRun: {
        findUnique(input: {
            where: { id: string }
            select: typeof AGENT_RUN_TRACE_RUN_SELECT
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
const STORAGE_STRING_BYTE_LIMITS = [
    Math.floor(MAX_TRACE_PAYLOAD_BYTES / 2),
    64 * 1024,
    16 * 1024,
    4 * 1024,
]
const STORAGE_FALLBACK_MESSAGE = `Trace payload exceeded ${MAX_TRACE_PAYLOAD_BYTES} bytes after normalization; stored compact trace metadata.`
const FALLBACK_TEXT_BYTES = 4 * 1024
const FALLBACK_LIST_ITEMS = 100

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

function truncateOptionalText(
    value: string | undefined,
    maxBytes = FALLBACK_TEXT_BYTES,
): string | undefined {
    return value === undefined
        ? undefined
        : truncateTraceText(value, maxBytes).text
}

function compactCompaction(compaction: CompactionTrace): CompactionTrace {
    return {
        applied: compaction.applied,
        reason: compaction.reason,
        beforeEstimatedInputTokens: compaction.beforeEstimatedInputTokens,
        afterEstimatedInputTokens: compaction.afterEstimatedInputTokens,
        affectedSegmentIds: compaction.affectedSegmentIds?.slice(
            0,
            FALLBACK_LIST_ITEMS,
        ),
        error: compaction.error
            ? {
                  message: truncateTraceText(
                      compaction.error.message,
                      FALLBACK_TEXT_BYTES,
                  ).text,
                  code: compaction.error.code,
              }
            : undefined,
    }
}

function compactResult(result: ResultTrace): ResultTrace {
    return {
        finalOutput: {
            text: truncateTraceText(
                result.finalOutput.text,
                FALLBACK_TEXT_BYTES,
            ).text,
            textHash: result.finalOutput.textHash,
            messageId: result.finalOutput.messageId,
            partsSummary: result.finalOutput.partsSummary,
        },
        usage: result.usage,
        provider: result.provider,
        finishReason: result.finishReason,
    }
}

function compactFailure(failure: FailureTrace): FailureTrace {
    return {
        phase: failure.phase,
        sourcePlugin: failure.sourcePlugin,
        hookName: failure.hookName,
        sourceTool: failure.sourceTool,
        source: failure.source,
        error: {
            message: truncateTraceText(
                failure.error.message,
                FALLBACK_TEXT_BYTES,
            ).text,
            name: failure.error.name,
            code: failure.error.code,
            stack: truncateOptionalText(failure.error.stack),
        },
        occurredAt: failure.occurredAt,
    }
}

function compactCacheResult(result: CacheResultTrace): CacheResultTrace {
    return {
        cacheObserved: result.cacheObserved,
        evidenceSource: result.evidenceSource,
        cacheReadObserved: result.cacheReadObserved,
        cacheWriteObserved: result.cacheWriteObserved,
        cacheReadEvidenceSource: result.cacheReadEvidenceSource,
        cacheWriteEvidenceSource: result.cacheWriteEvidenceSource,
        cacheReadTokens: result.cacheReadTokens,
        cacheWriteTokens: result.cacheWriteTokens,
        uncachedInputTokens: result.uncachedInputTokens,
        cachedTokenRatio: result.cachedTokenRatio,
        cacheDisabledReason: result.cacheDisabledReason,
        rolloutGateStatus: result.rolloutGateStatus,
        circuitBreakerState: result.circuitBreakerState,
    }
}

function compactTools(tools: ToolTrace): ToolTrace {
    return {
        available: tools.available
            .slice(0, FALLBACK_LIST_ITEMS)
            .map((tool) => ({
                name: tool.name,
                sourcePlugin: tool.sourcePlugin,
                category: tool.category,
            })),
        calls: tools.calls.slice(0, FALLBACK_LIST_ITEMS).map((call) => ({
            index: call.index,
            stepIndex: call.stepIndex,
            toolName: call.toolName,
            toolCallId: call.toolCallId,
            args: sanitizeTraceJson(
                {
                    status: call.args.truncated
                        ? 'truncated_before_storage_fallback'
                        : 'omitted_by_storage_fallback',
                    redacted: call.args.redacted,
                    notes: call.args.notes,
                },
                DEFAULT_TRACE_JSON_OPTIONS,
            ),
            result: call.result
                ? sanitizeTraceJson(
                      {
                          status: call.result.truncated
                              ? 'truncated_before_storage_fallback'
                              : 'omitted_by_storage_fallback',
                          redacted: call.result.redacted,
                          notes: call.result.notes,
                      },
                      DEFAULT_TRACE_JSON_OPTIONS,
                  )
                : undefined,
            status: call.status,
            error: call.error
                ? {
                      message: truncateTraceText(
                          call.error.message,
                          FALLBACK_TEXT_BYTES,
                      ).text,
                      name: call.error.name,
                      code: call.error.code,
                  }
                : undefined,
        })),
    }
}

function createStorageFallbackPayload(
    payload: AgentRunTracePayload,
): AgentRunTracePayload {
    const warnings = (payload.warnings ?? []).slice(-3).map((warning) => ({
        source: warning.source,
        message: truncateTraceText(warning.message, 1024).text,
        occurredAt: warning.occurredAt,
    }))

    const fallback: AgentRunTracePayload = {
        version: payload.version,
        runId: payload.runId,
        traceStatus: payload.traceStatus,
        runOutcome: payload.runOutcome,
        currentPhase: payload.currentPhase,
        completedPhases: payload.completedPhases,
        updatedAt: payload.updatedAt,
        warnings: [
            ...warnings,
            {
                source: 'trace.storage',
                message: STORAGE_FALLBACK_MESSAGE,
                occurredAt: payload.updatedAt,
            },
        ],
    }

    if (payload.compaction) {
        fallback.compaction = compactCompaction(payload.compaction)
    }

    if (payload.prompt) {
        fallback.prompt = {
            finalInput: {
                systemText: truncateTraceText(
                    payload.prompt.finalInput.systemText,
                    4 * 1024,
                ).text,
                modelMessages: [],
                tools: [],
                params: { resolved: {}, candidates: [] },
            },
            segments: [],
            totalEstimatedInputTokens: payload.prompt.totalEstimatedInputTokens,
        }
    }
    if (payload.result) {
        fallback.result = compactResult(payload.result)
    }
    if (payload.failure) {
        fallback.failure = compactFailure(payload.failure)
    }
    if (payload.cache?.result) {
        fallback.cache = { result: compactCacheResult(payload.cache.result) }
    }
    if (payload.tools) {
        fallback.tools = compactTools(payload.tools)
    }

    const safe = sanitizeTraceJson(stripUndefinedObjectFields(fallback), {
        ...DEFAULT_TRACE_JSON_OPTIONS,
        maxBytes: MAX_TRACE_PAYLOAD_BYTES,
        maxDepth: 32,
        maxArrayItems: FALLBACK_LIST_ITEMS,
        maxStringBytes: FALLBACK_TEXT_BYTES,
    })

    if (
        safe.value &&
        typeof safe.value === 'object' &&
        !Array.isArray(safe.value)
    ) {
        return safe.value as AgentRunTracePayload
    }

    return {
        version: payload.version,
        runId: payload.runId,
        traceStatus: payload.traceStatus,
        runOutcome: payload.runOutcome,
        currentPhase: payload.currentPhase,
        completedPhases: payload.completedPhases,
        updatedAt: payload.updatedAt,
        warnings: [
            {
                source: 'trace.storage',
                message: STORAGE_FALLBACK_MESSAGE,
                occurredAt: payload.updatedAt,
            },
            {
                source: 'trace.storage',
                message:
                    'Compact trace fallback exceeded the storage cap; stored metadata only.',
                occurredAt: payload.updatedAt,
            },
        ],
    }
}

function normalizePayloadForStorage(
    payload: AgentRunTracePayload,
): AgentRunTracePayload {
    const stripped = stripUndefinedObjectFields(payload)

    for (const maxStringBytes of STORAGE_STRING_BYTE_LIMITS) {
        const safe = sanitizeTraceJson(stripped, {
            ...DEFAULT_TRACE_JSON_OPTIONS,
            maxBytes: MAX_TRACE_PAYLOAD_BYTES,
            maxDepth: 32,
            maxArrayItems: 10_000,
            maxStringBytes,
        })

        if (
            safe.value &&
            typeof safe.value === 'object' &&
            !Array.isArray(safe.value)
        ) {
            const storedPayload = safe.value as AgentRunTracePayload
            if (
                measureTraceJsonBytes(storedPayload) <= MAX_TRACE_PAYLOAD_BYTES
            ) {
                return storedPayload
            }
        }
    }

    return createStorageFallbackPayload(payload)
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
    return payload as unknown as Prisma.InputJsonValue
}

function preparePayloadForStorage(
    payload: AgentRunTracePayload,
): AgentRunTracePayload {
    const storedPayload = normalizePayloadForStorage(payload)
    assertPayloadFits(storedPayload)
    return storedPayload
}

export function createPrismaAgentRunTraceStore(
    db: AgentRunTraceDb,
): AgentRunTraceStore {
    return {
        async createRecording(payload) {
            for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt++) {
                const existing = await db.agentRunTrace.findUnique({
                    where: { runId: payload.runId },
                })
                const existingPayload = asPayload(existing?.payload)
                if (existingPayload) {
                    return
                }

                const storedPayload = preparePayloadForStorage(payload)
                const storedJson = toPrismaJson(storedPayload)
                if (existing) {
                    const result = await db.agentRunTrace.updateMany({
                        where: {
                            runId: payload.runId,
                            ...(existing.updatedAt
                                ? { updatedAt: existing.updatedAt }
                                : {}),
                        },
                        data: {
                            status: storedPayload.traceStatus,
                            phase: storedPayload.currentPhase,
                            payload: storedJson,
                        },
                    })
                    if (result.count > 0) return
                    continue
                }

                try {
                    await db.agentRunTrace.create({
                        data: {
                            runId: payload.runId,
                            status: storedPayload.traceStatus,
                            phase: storedPayload.currentPhase,
                            payload: storedJson,
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

                const storedPayload = preparePayloadForStorage(payload)
                const result = await db.agentRunTrace.updateMany({
                    where: {
                        runId,
                        ...(row?.updatedAt ? { updatedAt: row.updatedAt } : {}),
                    },
                    data: {
                        status: storedPayload.traceStatus,
                        phase: storedPayload.currentPhase,
                        payload: toPrismaJson(storedPayload),
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

                const storedPayload = preparePayloadForStorage(payload)
                const result = await db.agentRunTrace.updateMany({
                    where: {
                        runId,
                        ...(row?.updatedAt ? { updatedAt: row.updatedAt } : {}),
                    },
                    data: {
                        status: storedPayload.traceStatus,
                        phase: storedPayload.currentPhase,
                        payload: toPrismaJson(storedPayload),
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
                    select: AGENT_RUN_TRACE_RUN_SELECT,
                }),
            ])
            const trace = asPayload(traceRow?.payload)
            return run && trace ? { run, trace } : null
        },
    }
}
