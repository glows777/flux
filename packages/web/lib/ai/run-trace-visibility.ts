import type { UIMessage } from 'ai'

type JsonObject = Record<string, unknown>

export type TraceStatus = 'recording' | 'complete' | 'incomplete'
export type RunOutcome = 'succeeded' | 'failed' | 'cancelled' | 'unknown'
export type TracePhase =
    | 'created'
    | 'before_run'
    | 'collect_context'
    | 'assemble_context'
    | 'prepare_model_request'
    | 'model_stream'
    | 'finalize'
    | 'after_run'

export interface RunTraceSystemSegment {
    readonly id: string
    readonly target: 'system'
    readonly kind: string
    readonly sourcePlugin: string
    readonly origin?: string
    readonly finalOrder: number
    readonly content: { readonly format: 'text'; readonly text: string }
    readonly contentHash: string
    readonly estimatedTokens?: number
    readonly cacheability: 'stable' | 'session' | 'volatile' | 'none'
    readonly compactability: 'preserve' | 'summarize' | 'trim'
}

export interface RunTraceMessageSegment {
    readonly id: string
    readonly target: 'messages'
    readonly kind: string
    readonly sourcePlugin: string
    readonly origin?: string
    readonly messageIds: readonly string[]
    readonly messageCount: number
    readonly roles: readonly string[]
    readonly contentHash: string
    readonly estimatedTokens?: number
    readonly cacheability: 'stable' | 'session' | 'volatile' | 'none'
    readonly compactability: 'preserve' | 'summarize' | 'trim'
}

export type RunTraceSegment = RunTraceSystemSegment | RunTraceMessageSegment

export interface RunTraceToolSummary {
    readonly name: string
    readonly description?: string
    readonly inputSchemaSummary?: unknown
    readonly sourcePlugin: string
    readonly category?: 'data' | 'display' | 'memory' | 'trading' | 'research'
    readonly estimatedTokens?: number
}

export interface RunTracePayload {
    readonly version: 1
    readonly runId: string
    readonly traceStatus: TraceStatus
    readonly runOutcome: RunOutcome
    readonly currentPhase: TracePhase
    readonly completedPhases: readonly TracePhase[]
    readonly prompt?: {
        readonly finalInput: {
            readonly systemText: string
            readonly modelMessages: readonly unknown[]
            readonly tools: readonly RunTraceToolSummary[]
            readonly params: {
                readonly resolved: JsonObject
                readonly candidates: readonly {
                    readonly plugin: string
                    readonly key: string
                    readonly value: unknown
                }[]
            }
        }
        readonly segments: readonly RunTraceSegment[]
        readonly totalEstimatedInputTokens: number
    }
    readonly plugins?: unknown
    readonly tools?: unknown
    readonly cache?: {
        readonly plan?: unknown
        readonly providerRequest?: unknown
        readonly result?: {
            readonly cacheObserved: boolean
            readonly evidenceSource: string
            readonly cacheReadObserved: boolean
            readonly cacheWriteObserved: boolean
            readonly cacheReadEvidenceSource: string
            readonly cacheWriteEvidenceSource: string
            readonly cacheReadTokens?: number
            readonly cacheWriteTokens?: number
            readonly uncachedInputTokens?: number
            readonly cachedTokenRatio?: number
            readonly providerRawCacheUsage?: unknown
            readonly cacheDisabledReason?: string
            readonly rolloutGateStatus: string
            readonly circuitBreakerState: string
        }
    }
    readonly compaction?: unknown
    readonly result?: unknown
    readonly failure?: unknown
    readonly warnings?: readonly unknown[]
    readonly recordingError?: {
        readonly message: string
        readonly code?: string
        readonly occurredAt: string
    }
    readonly updatedAt: string
}

export interface RunTraceRecord {
    readonly run: {
        readonly id: string
        readonly status: string
        readonly startedAt: string
        readonly finishedAt: string | null
        readonly [key: string]: unknown
    }
    readonly trace: RunTracePayload
}

export type RunTraceState =
    | { readonly status: 'idle' }
    | { readonly status: 'loading' }
    | { readonly status: 'unavailable' }
    | { readonly status: 'error'; readonly error: string }
    | { readonly status: 'ready'; readonly record: RunTraceRecord }

export interface RunTraceSummaryChip {
    readonly label: string
    readonly tone: 'neutral' | 'emerald' | 'warning' | 'rose'
}

export interface RunTraceSummaryModel {
    readonly chips: readonly RunTraceSummaryChip[]
    readonly statsLine: string
    readonly actionLabel: string
    readonly statusTone: 'neutral' | 'warning' | 'rose'
}

export interface RunTraceSegmentGroup {
    readonly key: string
    readonly title: string
    readonly description: string
    readonly segments: readonly RunTraceSegment[]
    readonly estimatedTokens: number
    readonly messageCount: number
    readonly collapsedByDefault: boolean
}

function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is readonly string[] {
    return (
        Array.isArray(value) && value.every((item) => typeof item === 'string')
    )
}

function isTraceSegment(value: unknown): value is RunTraceSegment {
    if (
        !isObject(value) ||
        typeof value.id !== 'string' ||
        typeof value.kind !== 'string' ||
        typeof value.sourcePlugin !== 'string' ||
        typeof value.contentHash !== 'string' ||
        typeof value.cacheability !== 'string' ||
        typeof value.compactability !== 'string'
    ) {
        return false
    }

    if (value.target === 'system') {
        return (
            typeof value.finalOrder === 'number' &&
            isObject(value.content) &&
            value.content.format === 'text' &&
            typeof value.content.text === 'string'
        )
    }

    if (value.target === 'messages') {
        return (
            isStringArray(value.messageIds) &&
            typeof value.messageCount === 'number' &&
            isStringArray(value.roles)
        )
    }

    return false
}

function isRunTracePayload(value: unknown): value is RunTracePayload {
    if (
        !isObject(value) ||
        value.version !== 1 ||
        typeof value.runId !== 'string' ||
        typeof value.traceStatus !== 'string' ||
        typeof value.runOutcome !== 'string' ||
        typeof value.currentPhase !== 'string' ||
        !Array.isArray(value.completedPhases) ||
        typeof value.updatedAt !== 'string'
    ) {
        return false
    }

    if (value.prompt == null) return true
    if (!isObject(value.prompt)) return false
    if (
        typeof value.prompt.totalEstimatedInputTokens !== 'number' ||
        !Array.isArray(value.prompt.segments) ||
        !value.prompt.segments.every(isTraceSegment) ||
        !isObject(value.prompt.finalInput) ||
        typeof value.prompt.finalInput.systemText !== 'string' ||
        !Array.isArray(value.prompt.finalInput.modelMessages) ||
        !Array.isArray(value.prompt.finalInput.tools) ||
        !isObject(value.prompt.finalInput.params)
    ) {
        return false
    }

    return true
}

function isRunTraceRecord(value: unknown): value is RunTraceRecord {
    return (
        isObject(value) &&
        isObject(value.run) &&
        typeof value.run.id === 'string' &&
        typeof value.run.status === 'string' &&
        typeof value.run.startedAt === 'string' &&
        (typeof value.run.finishedAt === 'string' ||
            value.run.finishedAt === null) &&
        isRunTracePayload(value.trace)
    )
}

export function isRunTraceResponse(
    value: unknown,
): value is { readonly success: true; readonly data: RunTraceRecord } {
    return (
        isObject(value) &&
        value.success === true &&
        isRunTraceRecord(value.data)
    )
}

function stringifyJson(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }
    if (value == null) return ''

    try {
        return JSON.stringify(value, null, 2) ?? ''
    } catch {
        return String(value)
    }
}

function extractErrorMessage(payload: unknown): string | null {
    if (!isObject(payload)) return null

    const message =
        typeof payload.error === 'string'
            ? payload.error
            : typeof payload.message === 'string'
              ? payload.message
              : null

    return message && message.length > 0 ? message : null
}

function formatTokenEstimate(tokens: number): string {
    if (tokens >= 1000) {
        const value =
            tokens >= 10000 ? Math.round(tokens / 1000) : tokens / 1000
        return `${value.toLocaleString('en-US', {
            minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
            maximumFractionDigits: 1,
        })}k`
    }

    return tokens.toLocaleString('en-US')
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
    return count === 1 ? singular : plural
}

export function formatSerializableContent(value: unknown): string {
    return stringifyJson(value)
}

export function formatSegmentSource(segment: RunTraceSegment): string {
    return segment.origin
        ? `${segment.sourcePlugin} · ${segment.origin}`
        : segment.sourcePlugin
}

export function getRunIdFromMessage(
    message: UIMessage<{ readonly runId?: string }> | null | undefined,
): string | null {
    const runId = message?.metadata?.runId?.trim()
    return runId && runId.length > 0 ? runId : null
}

export function buildRunTraceSummaryModel(
    state: RunTraceState,
    options: { readonly isSelected?: boolean } = {},
): RunTraceSummaryModel {
    const actionLabel = options.isSelected ? 'Viewing' : 'View trace'

    switch (state.status) {
        case 'idle':
            return {
                chips: [],
                statsLine: 'Trace available',
                actionLabel,
                statusTone: 'neutral',
            }
        case 'loading':
            return {
                chips: [{ label: 'Loading', tone: 'neutral' }],
                statsLine: 'Loading trace...',
                actionLabel: 'Loading...',
                statusTone: 'neutral',
            }
        case 'unavailable':
            return {
                chips: [{ label: 'Unavailable', tone: 'warning' }],
                statsLine: 'Trace unavailable',
                actionLabel: 'Trace unavailable',
                statusTone: 'warning',
            }
        case 'error':
            return {
                chips: [{ label: 'Error', tone: 'rose' }],
                statsLine: state.error,
                actionLabel: 'Trace error',
                statusTone: 'rose',
            }
        case 'ready': {
            const trace = state.record.trace
            const prompt = trace.prompt
            const cache = trace.cache?.result
            const toolCount = prompt?.finalInput.tools.length ?? 0
            const segmentCount = prompt?.segments.length ?? 0
            const inputTokens = prompt?.totalEstimatedInputTokens ?? 0
            const chips: RunTraceSummaryChip[] = []

            if (cache?.cacheReadObserved) {
                chips.push({ label: 'Cache read', tone: 'emerald' })
            }
            if (cache?.cacheWriteObserved) {
                chips.push({ label: 'Cache write', tone: 'emerald' })
            }
            chips.push({
                label: `${toolCount} ${pluralize(toolCount, 'tool')}`,
                tone: toolCount > 0 ? 'neutral' : 'warning',
            })
            chips.push({
                label: `${segmentCount} ${pluralize(segmentCount, 'segment')}`,
                tone: segmentCount > 0 ? 'neutral' : 'warning',
            })

            return {
                chips,
                statsLine: `Trace ${trace.traceStatus} · ${trace.runOutcome} · ~${formatTokenEstimate(inputTokens)} input`,
                actionLabel,
                statusTone:
                    trace.runOutcome === 'failed' ||
                    trace.traceStatus === 'incomplete'
                        ? 'warning'
                        : 'neutral',
            }
        }
    }
}

export function buildTraceSegmentGroups(
    record: RunTraceRecord,
): readonly RunTraceSegmentGroup[] {
    const segments = record.trace.prompt?.segments ?? []
    const grouped = new Map<string, RunTraceSegment[]>()

    for (const segment of segments) {
        const key = `${segment.kind}:${segment.sourcePlugin}`
        grouped.set(key, [...(grouped.get(key) ?? []), segment])
    }

    return [...grouped.entries()]
        .sort(([keyA], [keyB]) => {
            const aIsSystem = keyA.startsWith('system.')
            const bIsSystem = keyB.startsWith('system.')
            if (aIsSystem !== bIsSystem) return aIsSystem ? 1 : -1
            return keyA.localeCompare(keyB)
        })
        .map(([key, groupSegments]) => {
            const [kind = key, sourcePlugin = 'unknown'] = key.split(':')
            const messageCount = groupSegments.reduce(
                (total, segment) =>
                    total +
                    (segment.target === 'messages' ? segment.messageCount : 0),
                0,
            )

            return {
                key,
                title: `${kind} · ${sourcePlugin}`,
                description: `${groupSegments.length} ${pluralize(
                    groupSegments.length,
                    'segment',
                )} from ${sourcePlugin}.`,
                segments: groupSegments,
                estimatedTokens: groupSegments.reduce(
                    (total, segment) => total + (segment.estimatedTokens ?? 0),
                    0,
                ),
                messageCount,
                collapsedByDefault: kind.startsWith('system.'),
            }
        })
}

export async function fetchRunTrace(
    runId: string,
): Promise<RunTraceRecord | null> {
    const response = await fetch(
        `/api/runs/${encodeURIComponent(runId)}/trace`,
        {
            headers: { Accept: 'application/json' },
        },
    )

    if (response.status === 404) {
        return null
    }

    let payload: unknown = null
    try {
        payload = await response.json()
    } catch {
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`)
        }
        throw new Error('Failed to parse run trace response')
    }

    if (!response.ok) {
        const errorMessage = extractErrorMessage(payload)
        if (errorMessage) {
            throw new Error(errorMessage)
        }
        throw new Error(`API error: ${response.status}`)
    }

    if (isRunTraceResponse(payload)) {
        return payload.data
    }

    throw new Error('Invalid run trace response')
}
