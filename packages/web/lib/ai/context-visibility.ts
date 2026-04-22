import type { UIMessage } from 'ai'

type JsonObject = Record<string, unknown>

export interface MessageContextSegmentPayloadText {
    readonly format: 'text'
    readonly text: string
}

export interface MessageContextSegmentPayloadMessages {
    readonly format: 'messages'
    readonly messages: readonly UIMessage[]
}

export type MessageContextSegmentPayload =
    | MessageContextSegmentPayloadText
    | MessageContextSegmentPayloadMessages

export interface MessageContextSegment {
    readonly id: string
    readonly target: 'system' | 'messages'
    readonly kind:
        | 'system.base'
        | 'system.instructions'
        | 'memory.long_lived'
        | 'history.recent'
        | 'live.runtime'
    readonly payload: MessageContextSegmentPayload
    readonly source: {
        readonly plugin: string
        readonly origin?: string
    }
    readonly priority: 'required' | 'high' | 'medium' | 'low'
    readonly cacheability: 'stable' | 'session' | 'volatile' | 'none'
    readonly compactability: 'preserve' | 'summarize' | 'trim'
    readonly included?: boolean
    readonly finalOrder?: number
    readonly estimatedTokens?: number
}

export interface MessageContextToolContribution {
    readonly name: string
    readonly definition: {
        readonly tool: unknown
    }
    readonly source: string
    readonly manifestSpec: {
        readonly description?: string
        readonly inputSchemaSummary?: unknown
    }
    readonly estimatedTokens?: number
}

export interface MessageContextManifest {
    readonly input: {
        readonly channel: 'web' | 'discord' | 'cron'
        readonly mode: string
        readonly agentType: string
        readonly rawMessages: readonly UIMessage[]
        readonly initialSessionId?: string
        readonly resolvedSessionId?: string
        readonly defaults: JsonObject
    }
    readonly pluginOutputs: readonly {
        readonly plugin: string
        readonly output: unknown
    }[]
    readonly assembledContext: {
        readonly segments: readonly MessageContextSegment[]
        readonly systemSegments: readonly MessageContextSegment[]
        readonly tools: readonly MessageContextToolContribution[]
        readonly params: {
            readonly candidates: readonly {
                readonly plugin: string
                readonly key: string
                readonly value: unknown
            }[]
            readonly resolved: JsonObject
        }
        readonly totalEstimatedInputTokens: number
    }
    readonly modelRequest: {
        readonly systemText: string
        readonly modelMessages: readonly UIMessage[]
        readonly toolNames: readonly string[]
        readonly resolvedParams: JsonObject
        readonly maxOutputTokens?: number
        readonly providerOptions: JsonObject
    }
    readonly result?: {
        readonly text: string
        readonly responseMessage: UIMessage
        readonly toolCalls: readonly {
            readonly toolName: string
            readonly args: unknown
            readonly result: unknown
        }[]
        readonly usage: {
            readonly inputTokens: number | undefined
            readonly outputTokens: number | undefined
        }
    }
}

export interface MessageContextRecord {
    readonly version: number
    readonly runId: string
    readonly manifest: MessageContextManifest
}

export type MessageContextState =
    | { readonly status: 'idle' }
    | { readonly status: 'loading' }
    | { readonly status: 'unavailable' }
    | { readonly status: 'error'; readonly error: string }
    | { readonly status: 'ready'; readonly record: MessageContextRecord }

export interface MessageContextSummaryChip {
    readonly label: string
    readonly tone: 'neutral' | 'emerald' | 'warning' | 'rose'
}

export interface MessageContextSummaryModel {
    readonly chips: readonly MessageContextSummaryChip[]
    readonly statsLine: string
    readonly actionLabel: string
    readonly statusTone: 'neutral' | 'warning' | 'rose'
}

export interface MessageContextSegmentGroup {
    readonly key: 'recent' | 'memory' | 'runtime' | 'system'
    readonly title: string
    readonly description: string
    readonly segments: readonly MessageContextSegment[]
    readonly estimatedTokens: number
    readonly collapsedByDefault: boolean
}

function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUIMessage(value: unknown): value is UIMessage {
    return isObject(value) && typeof value.id === 'string'
}

function isUIMessageArray(value: unknown): value is readonly UIMessage[] {
    return Array.isArray(value) && value.every(isUIMessage)
}

function isSegmentPayload(
    value: unknown,
): value is MessageContextSegmentPayload {
    if (!isObject(value) || typeof value.format !== 'string') return false
    if (value.format === 'text') return typeof value.text === 'string'
    if (value.format === 'messages') return isUIMessageArray(value.messages)
    return false
}

function isMessageContextSegment(
    value: unknown,
): value is MessageContextSegment {
    return (
        isObject(value) &&
        typeof value.id === 'string' &&
        (value.target === 'system' || value.target === 'messages') &&
        typeof value.kind === 'string' &&
        isSegmentPayload(value.payload) &&
        isObject(value.source) &&
        typeof value.source.plugin === 'string' &&
        typeof value.priority === 'string' &&
        typeof value.cacheability === 'string' &&
        typeof value.compactability === 'string'
    )
}

function isMessageContextRecord(value: unknown): value is MessageContextRecord {
    return (
        isObject(value) &&
        typeof value.version === 'number' &&
        typeof value.runId === 'string' &&
        isObject(value.manifest) &&
        isObject(value.manifest.input) &&
        isUIMessageArray(value.manifest.input.rawMessages) &&
        Array.isArray(value.manifest.pluginOutputs) &&
        isObject(value.manifest.assembledContext) &&
        Array.isArray(value.manifest.assembledContext.segments) &&
        value.manifest.assembledContext.segments.every(
            isMessageContextSegment,
        ) &&
        Array.isArray(value.manifest.assembledContext.systemSegments) &&
        value.manifest.assembledContext.systemSegments.every(
            isMessageContextSegment,
        ) &&
        Array.isArray(value.manifest.assembledContext.tools) &&
        isObject(value.manifest.assembledContext.params) &&
        Array.isArray(value.manifest.assembledContext.params.candidates) &&
        isObject(value.manifest.modelRequest) &&
        typeof value.manifest.modelRequest.systemText === 'string' &&
        isUIMessageArray(value.manifest.modelRequest.modelMessages) &&
        Array.isArray(value.manifest.modelRequest.toolNames) &&
        isObject(value.manifest.modelRequest.providerOptions)
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

export function formatSegmentSource(
    source: MessageContextSegment['source'],
): string {
    return source.origin ? `${source.plugin} · ${source.origin}` : source.plugin
}

export function formatSerializableContent(value: unknown): string {
    return stringifyJson(value)
}

export function formatCompactTokenEstimate(tokens: number): string {
    return `~${formatTokenEstimate(tokens)} input`
}

export function hasSegmentKind(
    record: MessageContextRecord,
    kind: MessageContextSegment['kind'],
) {
    return record.manifest.assembledContext.segments.some(
        (segment) => segment.kind === kind,
    )
}

export function buildMessageContextSummaryModel(
    state: MessageContextState,
    options: { readonly isSelected?: boolean } = {},
): MessageContextSummaryModel {
    const actionLabel = options.isSelected ? 'Viewing' : 'View context'

    switch (state.status) {
        case 'idle':
            return {
                chips: [],
                statsLine: 'Context available',
                actionLabel,
                statusTone: 'neutral',
            }
        case 'loading':
            return {
                chips: [{ label: 'Loading', tone: 'neutral' }],
                statsLine: 'Loading context…',
                actionLabel: 'Loading…',
                statusTone: 'neutral',
            }
        case 'unavailable':
            return {
                chips: [{ label: 'Unavailable', tone: 'warning' }],
                statsLine: 'Context unavailable',
                actionLabel: 'Unavailable',
                statusTone: 'warning',
            }
        case 'error':
            return {
                chips: [{ label: 'Error', tone: 'rose' }],
                statsLine: state.error,
                actionLabel: 'Retry',
                statusTone: 'rose',
            }
        case 'ready': {
            const record = state.record
            const assembled = record.manifest.assembledContext
            const hasMemory = hasSegmentKind(record, 'memory.long_lived')
            const hasRecent = hasSegmentKind(record, 'history.recent')
            const hasRuntime = hasSegmentKind(record, 'live.runtime')
            const isLargeContext = assembled.totalEstimatedInputTokens >= 2000
            const chips: MessageContextSummaryChip[] = []

            if (hasMemory) chips.push({ label: 'Memory', tone: 'emerald' })
            if (hasRecent) chips.push({ label: 'Recent', tone: 'neutral' })
            if (hasRuntime) chips.push({ label: 'Runtime', tone: 'neutral' })

            chips.push({
                label: `${assembled.tools.length} tools`,
                tone: assembled.tools.length > 0 ? 'neutral' : 'warning',
            })

            if (!hasMemory && isLargeContext) {
                chips.push({ label: 'Large', tone: 'warning' })
                return {
                    chips,
                    statsLine: 'Memory not included',
                    actionLabel,
                    statusTone: 'warning',
                }
            }

            return {
                chips,
                statsLine: `${assembled.segments.length} segments · ${formatCompactTokenEstimate(assembled.totalEstimatedInputTokens)}`,
                actionLabel,
                statusTone: 'neutral',
            }
        }
    }
}

export function buildSegmentGroups(
    record: MessageContextRecord,
): readonly MessageContextSegmentGroup[] {
    const definitions = [
        {
            key: 'recent' as const,
            title: 'Recent conversation',
            description: 'Turns included from the active chat session.',
            match: (segment: MessageContextSegment) =>
                segment.kind === 'history.recent',
            collapsedByDefault: false,
        },
        {
            key: 'memory' as const,
            title: 'Long-lived memory',
            description: 'Persisted user and strategy context.',
            match: (segment: MessageContextSegment) =>
                segment.kind === 'memory.long_lived',
            collapsedByDefault: false,
        },
        {
            key: 'runtime' as const,
            title: 'Runtime context',
            description: 'Per-turn runtime values such as symbol or channel.',
            match: (segment: MessageContextSegment) =>
                segment.kind === 'live.runtime',
            collapsedByDefault: false,
        },
        {
            key: 'system' as const,
            title: 'System',
            description: 'Stable system prompts and instructions.',
            match: (segment: MessageContextSegment) =>
                segment.kind === 'system.base' ||
                segment.kind === 'system.instructions',
            collapsedByDefault: true,
        },
    ]

    return definitions
        .map((definition) => {
            const segments = record.manifest.assembledContext.segments.filter(
                definition.match,
            )

            return {
                key: definition.key,
                title: definition.title,
                description: definition.description,
                segments,
                estimatedTokens: segments.reduce(
                    (total, segment) => total + (segment.estimatedTokens ?? 0),
                    0,
                ),
                collapsedByDefault: definition.collapsedByDefault,
            }
        })
        .filter((group) => group.segments.length > 0)
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
    return count === 1 ? singular : plural
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

export function buildContextTriggerLabel(state: MessageContextState): string {
    switch (state.status) {
        case 'idle':
            return 'Open context'
        case 'loading':
            return 'Loading context...'
        case 'unavailable':
            return 'Context unavailable'
        case 'error':
            return 'Context error'
        case 'ready': {
            const assembled = state.record.manifest.assembledContext
            return `Context ready · ${assembled.segments.length} ${pluralize(
                assembled.segments.length,
                'segment',
            )} · ${assembled.tools.length} ${pluralize(
                assembled.tools.length,
                'tool',
            )} · ~${formatTokenEstimate(assembled.totalEstimatedInputTokens)} in`
        }
    }
}

export async function fetchMessageContext(
    sessionId: string,
    messageId: string,
): Promise<MessageContextRecord | null> {
    const response = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/context`,
        {
            headers: { Accept: 'application/json' },
        },
    )

    let payload: unknown = null
    try {
        payload = await response.json()
    } catch {
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`)
        }
        throw new Error('Failed to parse message context response')
    }

    if (!response.ok) {
        const errorMessage = extractErrorMessage(payload)
        if (errorMessage) {
            throw new Error(errorMessage)
        }
        throw new Error(`API error: ${response.status}`)
    }

    if (isObject(payload) && payload.success === true) {
        if (payload.data == null) {
            return null
        }
        if (isMessageContextRecord(payload.data)) {
            return payload.data
        }
    }

    if (isMessageContextRecord(payload)) {
        return payload
    }

    throw new Error('Invalid message context response')
}
