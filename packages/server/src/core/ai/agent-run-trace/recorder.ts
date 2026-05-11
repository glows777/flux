import { DEFAULT_TRACE_JSON_OPTIONS, sanitizeTraceJson } from './json'
import type { AgentRunTraceStore, TraceCheckpointInput } from './store'
import type {
    AgentRunTracePayload,
    FailureTrace,
    MinimalFailureTraceInput,
    TracePhase,
} from './types'

export interface TraceRecorderOptions {
    store: AgentRunTraceStore
}

function nowIso(): string {
    return new Date().toISOString()
}

function normalizeFailure(
    error: unknown,
    phase: TracePhase,
    source?: FailureTrace['source'],
): FailureTrace {
    const safe = sanitizeTraceJson(error, DEFAULT_TRACE_JSON_OPTIONS)
    const record =
        safe.value && typeof safe.value === 'object'
            ? (safe.value as Record<string, unknown>)
            : {}

    return {
        phase,
        source,
        error: {
            message:
                typeof record.message === 'string'
                    ? record.message
                    : error instanceof Error
                      ? error.message
                      : String(error),
            name:
                typeof record.name === 'string'
                    ? record.name
                    : error instanceof Error
                      ? error.name
                      : 'Error',
            ...(typeof record.code === 'string' ? { code: record.code } : {}),
            ...(typeof record.stack === 'string'
                ? { stack: record.stack }
                : {}),
        },
        occurredAt: nowIso(),
    }
}

export class TraceRecorder {
    private queues = new Map<string, Promise<void>>()

    constructor(private readonly options: TraceRecorderOptions) {}

    async startRun(runId: string): Promise<void> {
        const payload: AgentRunTracePayload = {
            version: 1,
            runId,
            traceStatus: 'recording',
            runOutcome: 'unknown',
            currentPhase: 'created',
            completedPhases: [],
            compaction: { applied: false, reason: 'not_implemented' },
            updatedAt: nowIso(),
        }
        await this.options.store.createRecording(payload)
    }

    checkpoint(
        runId: string,
        phase: TracePhase,
        patch: TraceCheckpointInput['patch'],
        status: TraceCheckpointInput['status'] = 'recording',
    ): Promise<void> {
        const current = this.queues.get(runId) ?? Promise.resolve()
        const next = current.then(() =>
            this.options.store.mergeCheckpoint(runId, {
                status,
                phase,
                patch,
            }),
        )
        this.queues.set(
            runId,
            next.catch(() => undefined),
        )
        return next
    }

    async recordFailure(
        runId: string,
        phase: TracePhase,
        error: unknown,
    ): Promise<void> {
        await this.checkpoint(
            runId,
            phase,
            {
                runOutcome: 'failed',
                failure: normalizeFailure(error, phase, 'runtime'),
            },
            'complete',
        )
    }

    async recordMinimalFailure(input: MinimalFailureTraceInput): Promise<void> {
        const existing = await this.options.store.loadByRunId(input.runId)
        if (!existing) await this.startRun(input.runId)

        await this.checkpoint(
            input.runId,
            input.phase,
            {
                runOutcome: 'failed',
                failure: normalizeFailure(
                    input.error,
                    input.phase,
                    input.source,
                ),
            },
            'complete',
        )
    }

    async markIncomplete(runId: string, error: unknown): Promise<void> {
        await this.options.store.markIncomplete(runId, error)
    }
}
