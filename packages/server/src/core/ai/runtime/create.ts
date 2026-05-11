import type {
    LanguageModelUsage,
    ModelMessage,
    ProviderMetadata,
    UIMessage,
} from 'ai'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { createRunId } from '@/core/ai/agent-run'
import {
    DEFAULT_TRACE_JSON_OPTIONS,
    hashTraceText,
    hashTraceValue,
    sanitizeTraceJson,
    truncateTraceText,
} from '@/core/ai/agent-run-trace/json'
import type {
    AgentRunTracePayload,
    CachePlanTrace,
    CacheProviderRequestTrace,
    CacheResultTrace,
    FailureTrace,
    PluginTrace,
    PromptTrace,
    ResultTrace,
    ToolCallTrace,
    ToolTrace,
    TracePhase,
    TraceStatus,
    TraceWarning,
} from '@/core/ai/agent-run-trace/types'
import { assembleContextRequest } from './assembly'
import { buildCachePlan } from './cache-plan'
import {
    collectPluginOutputs,
    runAfterRunHooks,
    runBeforeRunHooks,
    runOnErrorHooks,
} from './execute'
import {
    buildProviderCacheRequest,
    normalizeProviderCacheResult,
} from './provider-cache'
import type {
    AIRuntime,
    ChatInput,
    ChatOutput,
    ChatParams,
    ConsumedResult,
    ModelRequestSnapshot,
    PluginOutput,
    RunContext,
    RuntimeOptions,
    ToolCallRecord,
    ToolContributionSnapshot,
} from './types'
import { DEFAULT_CHAT_PARAMS } from './types'

interface StepWithToolCalls {
    readonly toolCalls?: Array<{
        readonly toolName: string
        readonly toolCallId?: string
        readonly id?: string
        readonly args: unknown
    }>
    readonly toolResults?: Array<{
        readonly toolCallId?: string
        readonly result?: unknown
        readonly error?: unknown
    }>
    readonly toolErrors?: Array<unknown>
}

type ProviderKind = 'anthropic' | 'openai' | 'unknown'

const CACHE_FAILURE_THRESHOLD = 3

interface ProviderMessageSummary {
    readonly index: number
    readonly role: string
    readonly contentType: string
    readonly contentLength?: number
    readonly contentPartCount?: number
    readonly hasAnthropicCacheControl: boolean
    readonly anthropicCacheControl?: unknown
}

interface CacheControlBreakpointsSummary {
    readonly count: number
    readonly sources: {
        readonly providerMessages: number
        readonly tools: number
        readonly cachePlan: number
    }
}

interface ObservedModelRequestSnapshot extends ModelRequestSnapshot {
    readonly provider: ProviderKind
    readonly modelId?: string
    readonly preparedCacheRequest: boolean
    readonly usedCacheRequest: boolean
    readonly providerMessages: ProviderMessageSummary[]
    readonly cachedToolNames: string[]
    readonly cachedToolCount: number
    readonly cacheControlBreakpoints: CacheControlBreakpointsSummary
}

interface CacheRolloutState {
    plannerFailures: number
    adapterFailures: number
    disabled: boolean
}

const cacheRolloutStates = new Map<string, CacheRolloutState>()

export function __resetCacheRolloutStatesForTests(): void {
    cacheRolloutStates.clear()
}

function createResponseMessageId(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return crypto.randomUUID()
    }

    return `msg_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function validatePluginNames(plugins: RuntimeOptions['plugins']): void {
    const seen = new Set<string>()
    for (const plugin of plugins) {
        if (seen.has(plugin.name)) {
            throw new Error(`Duplicate plugin name: "${plugin.name}"`)
        }
        seen.add(plugin.name)
    }
}

function extractToolCalls(steps: unknown): ToolCallRecord[] {
    const records: ToolCallRecord[] = []

    try {
        if (!Array.isArray(steps)) return records

        for (const step of steps) {
            const { toolCalls: calls = [], toolResults: results = [] } =
                step as StepWithToolCalls

            for (let i = 0; i < calls.length; i++) {
                records.push({
                    toolName: calls[i].toolName,
                    args: calls[i].args,
                    result: results[i]?.result ?? null,
                })
            }
        }
    } catch {
        // Best-effort extraction for partially mocked stream results.
    }

    return records
}

function normalizeError(error: unknown): {
    message: string
    name?: string
    code?: string
    stack?: string
} {
    const code = (error as { code?: unknown } | null)?.code
    return {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Error',
        ...(typeof code === 'string' ? { code } : {}),
        ...(error instanceof Error && typeof error.stack === 'string'
            ? { stack: error.stack }
            : {}),
    }
}

function buildFailureTrace(params: {
    phase: TracePhase
    error: unknown
}): FailureTrace {
    return {
        phase: params.phase,
        source: 'runtime',
        error: normalizeError(params.error),
        occurredAt: new Date().toISOString(),
    }
}

function getPartType(part: unknown): string {
    return isPlainRecord(part) && typeof part.type === 'string'
        ? part.type
        : 'unknown'
}

function buildResultTrace(params: {
    text: string
    responseMessage: UIMessage
    usage: ConsumedResult['usage']
    provider: ProviderKind
    modelId?: string
}): ResultTrace {
    const parts = Array.isArray(params.responseMessage.parts)
        ? params.responseMessage.parts
        : []
    const partsSummary = parts.reduce(
        (summary, part) => {
            const type = getPartType(part)
            if (type === 'text') summary.textPartCount += 1
            else if (type === 'reasoning') summary.reasoningPartCount += 1
            else if (type.startsWith('tool-')) summary.toolPartCount += 1
            else summary.otherPartCount += 1
            return summary
        },
        {
            textPartCount: 0,
            reasoningPartCount: 0,
            toolPartCount: 0,
            otherPartCount: 0,
        },
    )
    const bounded = truncateTraceText(params.text)

    return {
        finalOutput: {
            text: bounded.text,
            textHash: hashTraceText(params.text),
            messageId: params.responseMessage.id,
            partsSummary,
        },
        usage: {
            inputTokens: params.usage.inputTokens,
            outputTokens: params.usage.outputTokens,
            totalTokens:
                params.usage.inputTokens != null &&
                params.usage.outputTokens != null
                    ? params.usage.inputTokens + params.usage.outputTokens
                    : undefined,
        },
        provider: {
            id: params.provider,
            modelId: params.modelId,
        },
    }
}

function buildPluginTrace(
    outputs: Array<{ plugin: string; output: PluginOutput }>,
): PluginTrace {
    return {
        contributions: outputs.map(({ plugin, output }) => ({
            plugin,
            segmentIds: (output.segments ?? []).map((segment) => segment.id),
            toolNames: (output.tools ?? []).map((tool) => tool.name),
            paramKeys: Object.keys(output.params ?? {}) as Array<
                keyof ChatParams
            >,
            diagnosticCount: output.diagnostics?.length ?? 0,
        })),
        diagnostics: outputs.flatMap(({ plugin, output }) =>
            (output.diagnostics ?? []).map((diagnostic) => ({
                plugin,
                level: diagnostic.level,
                message: diagnostic.message,
                origin: diagnostic.origin,
                data:
                    diagnostic.data === undefined
                        ? undefined
                        : sanitizeTraceJson(
                              diagnostic.data,
                              DEFAULT_TRACE_JSON_OPTIONS,
                          ),
            })),
        ),
    }
}

function buildRuntimeOwnership(
    outputs: Array<{ plugin: string; output: PluginOutput }>,
): {
    segmentOwners: Map<string, string>
    toolOwners: Map<string, string>
} {
    const segmentOwners = new Map<string, string>()
    const toolOwners = new Map<string, string>()

    for (const { plugin, output } of outputs) {
        for (const segment of output.segments ?? []) {
            segmentOwners.set(segment.id, plugin)
        }
        for (const tool of output.tools ?? []) {
            toolOwners.set(tool.name, plugin)
        }
    }

    return { segmentOwners, toolOwners }
}

function buildToolSummaries(params: {
    tools: ToolContributionSnapshot[]
    toolOwners: Map<string, string>
}): PromptTrace['finalInput']['tools'] {
    return params.tools.map((tool) => ({
        name: tool.name,
        description: tool.manifestSpec.description,
        inputSchemaSummary: tool.manifestSpec.inputSchemaSummary,
        sourcePlugin: params.toolOwners.get(tool.name) ?? tool.source,
        category: tool.definition.display?.category,
        estimatedTokens: tool.estimatedTokens,
    }))
}

function buildPromptTrace(params: {
    assembled: ReturnType<typeof assembleContextRequest> & {
        providerOptions: Record<string, unknown>
        resolvedMaxOutputTokens?: number
    }
    convertedMessages: ModelMessage[]
    segmentOwners: Map<string, string>
    toolOwners: Map<string, string>
}): PromptTrace {
    return {
        finalInput: {
            systemText: truncateTraceText(params.assembled.systemText).text,
            modelMessages: params.convertedMessages,
            tools: buildToolSummaries({
                tools: params.assembled.manifestTools,
                toolOwners: params.toolOwners,
            }),
            params: {
                candidates: params.assembled.candidates.map((candidate) => ({
                    plugin: candidate.plugin,
                    key: candidate.key,
                    value: candidate.value,
                })),
                resolved: params.assembled.resolved,
            },
        },
        segments: params.assembled.segments.map((segment) => {
            const sourcePlugin =
                params.segmentOwners.get(segment.id) ?? segment.source.plugin
            if (segment.target === 'system') {
                const text = segment.payload.text
                return {
                    id: segment.id,
                    target: 'system',
                    kind: segment.kind,
                    sourcePlugin,
                    origin: segment.source.origin,
                    finalOrder: segment.finalOrder,
                    content: {
                        format: 'text',
                        text: truncateTraceText(text).text,
                    },
                    contentHash: hashTraceText(text),
                    estimatedTokens: segment.estimatedTokens,
                    cacheability: segment.cacheability,
                    compactability: segment.compactability,
                }
            }

            const messages = segment.payload.messages
            return {
                id: segment.id,
                target: 'messages',
                kind: segment.kind,
                sourcePlugin,
                origin: segment.source.origin,
                messageIds: messages.map((message) => message.id),
                messageCount: messages.length,
                roles: messages.map((message) => message.role),
                contentHash: hashTraceValue(messages),
                cacheability: segment.cacheability,
                compactability: segment.compactability,
            }
        }),
        totalEstimatedInputTokens: params.assembled.totalEstimatedInputTokens,
    }
}

function buildCachePlanTrace(
    cachePlan: ReturnType<typeof buildCachePlan> | undefined,
): CachePlanTrace | undefined {
    if (!cachePlan) return undefined

    return {
        provider: cachePlan.provider,
        modelId: cachePlan.modelId,
        stableCoreSegmentIds: cachePlan.stableCoreSegmentIds,
        cacheableSessionSegmentIds: cachePlan.cacheableSessionSegmentIds,
        dynamicTailSegmentIds: cachePlan.dynamicTailSegmentIds,
        effectivePrefixSegmentIds: cachePlan.effectivePrefixSegmentIds,
        effectivePrefixEstimatedTokens:
            cachePlan.effectivePrefixEstimatedTokens,
        hashes: cachePlan.hashes,
        eligibility: cachePlan.eligibility,
    }
}

function buildCacheProviderRequestTrace(
    snapshot: ObservedModelRequestSnapshot,
): CacheProviderRequestTrace {
    return {
        preparedCacheRequest: snapshot.preparedCacheRequest,
        usedCacheRequest: snapshot.usedCacheRequest,
        providerOptions: sanitizeTraceJson(snapshot.providerOptions),
        providerMessages: snapshot.providerMessages,
        cachedToolNames: snapshot.cachedToolNames,
        cachedToolCount: snapshot.cachedToolCount,
        cacheControlBreakpoints: snapshot.cacheControlBreakpoints,
    }
}

function buildCacheResultTrace(
    result: CacheResultTrace | undefined,
): CacheResultTrace | undefined {
    if (!result) return undefined
    return {
        ...result,
        providerRawCacheUsage:
            result.providerRawCacheUsage === undefined
                ? undefined
                : sanitizeTraceJson(result.providerRawCacheUsage),
    }
}

function extractTraceToolCalls(steps: unknown): ToolCallTrace[] {
    const records: ToolCallTrace[] = []

    try {
        if (!Array.isArray(steps)) return records

        for (const [stepIndex, step] of steps.entries()) {
            const {
                toolCalls: calls = [],
                toolResults: results = [],
                toolErrors: errors = [],
            } = step as StepWithToolCalls

            for (let i = 0; i < calls.length; i++) {
                const call = calls[i]
                const result = results[i]
                const error = result?.error ?? errors[i]

                records.push({
                    index: records.length,
                    stepIndex,
                    toolName: call.toolName,
                    toolCallId:
                        call.toolCallId ?? call.id ?? result?.toolCallId,
                    args: sanitizeTraceJson(call.args),
                    result:
                        result != null && 'result' in result
                            ? sanitizeTraceJson(result.result)
                            : undefined,
                    status:
                        error != null
                            ? 'failed'
                            : result != null
                              ? 'succeeded'
                              : 'unknown',
                    error:
                        error == null
                            ? undefined
                            : {
                                  message:
                                      error instanceof Error
                                          ? error.message
                                          : String(error),
                                  name:
                                      error instanceof Error
                                          ? error.name
                                          : undefined,
                                  code:
                                      typeof (
                                          error as { code?: unknown } | null
                                      )?.code === 'string'
                                          ? (
                                                error as {
                                                    code: string
                                                }
                                            ).code
                                          : undefined,
                              },
                })
            }
        }
    } catch {
        // Best-effort extraction for partially mocked stream results.
    }

    return records
}

function buildToolTrace(params: {
    tools: ToolContributionSnapshot[]
    toolOwners: Map<string, string>
    steps: unknown
}): ToolTrace {
    return {
        available: params.tools.map((tool) => ({
            name: tool.name,
            sourcePlugin: params.toolOwners.get(tool.name) ?? tool.source,
            category: tool.definition.display?.category,
        })),
        calls: extractTraceToolCalls(params.steps),
    }
}

function buildProviderOptions(
    params: Partial<ChatParams>,
): Record<string, unknown> {
    const providerOptions: Record<string, unknown> = {}

    if (params.thinkingBudget != null) {
        providerOptions.anthropic = {
            thinking: {
                type: 'enabled',
                budgetTokens: params.thinkingBudget,
            },
        }
    }

    return providerOptions
}

function resolveMaxOutputTokens(
    params: Partial<ChatParams>,
): number | undefined {
    return params.maxTokens
}

function inferProvider(model: RuntimeOptions['model']): ProviderKind {
    const candidateKeys = ['provider', 'providerId', 'providerName', 'modelId']
    const modelRecord = model as Record<string, unknown>

    for (const key of candidateKeys) {
        const value = modelRecord[key]
        if (typeof value !== 'string') continue

        const normalized = value.toLowerCase()
        if (normalized.includes('anthropic') || normalized.includes('claude')) {
            return 'anthropic'
        }

        if (
            normalized.includes('openai') ||
            normalized.startsWith('gpt') ||
            normalized.startsWith('o1') ||
            normalized.startsWith('o3') ||
            normalized.startsWith('o4')
        ) {
            return 'openai'
        }
    }

    return 'unknown'
}

function resolveModelId(model: RuntimeOptions['model']): string | undefined {
    const modelId = (model as Record<string, unknown>).modelId
    return typeof modelId === 'string' ? modelId : undefined
}

async function resolveOptionalStreamValue<T>(
    value: unknown,
): Promise<T | undefined> {
    if (value == null) return undefined
    return (await Promise.resolve(value)) as T
}

function getCacheRolloutKey(params: {
    provider: ProviderKind
    channel: RunContext['channel']
    mode: RunContext['mode']
    agentType: RunContext['agentType']
}): string {
    return [
        params.provider,
        params.channel,
        params.mode,
        params.agentType,
    ].join(':')
}

function getOrCreateCacheRolloutState(key: string): CacheRolloutState {
    const existingState = cacheRolloutStates.get(key)
    if (existingState) return existingState

    const newState: CacheRolloutState = {
        plannerFailures: 0,
        adapterFailures: 0,
        disabled: false,
    }
    cacheRolloutStates.set(key, newState)
    return newState
}

function resolveRolloutGateStatus(params: {
    circuitBreakerOpen: boolean
    usedCacheRequest: boolean
}): 'observe-only' | 'enabled' | 'disabled' {
    if (params.circuitBreakerOpen) return 'disabled'
    return params.usedCacheRequest ? 'enabled' : 'observe-only'
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value)
}

function getAnthropicCacheControl(value: unknown): unknown | undefined {
    if (!isPlainRecord(value)) return undefined

    const anthropic = value.anthropic
    if (!isPlainRecord(anthropic)) return undefined

    return anthropic.cacheControl
}

function extractLastUserText(messages: UIMessage[]): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i]
        if (message.role !== 'user') continue

        const textParts: string[] = []
        for (const part of message.parts) {
            if (!isPlainRecord(part) || part.type !== 'text') continue
            if (typeof part.text === 'string') textParts.push(part.text)
        }

        const text = textParts.join(' ').replace(/\s+/g, ' ').trim()
        if (text.length > 0) return text
    }

    return undefined
}

function trimSummaryText(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized.length <= 500) return normalized
    return `${normalized.slice(0, 500)}...`
}

function buildInputSummary(input: ChatInput): string {
    const agentType = input.agentType ?? 'trading-agent'
    const parts = [
        `channel=${input.channel}`,
        `mode=${input.mode}`,
        `agent=${agentType}`,
        `messages=${input.messages.length}`,
    ]

    if (input.symbol) parts.push(`symbol=${input.symbol}`)

    const lastUserText = extractLastUserText(input.messages)
    if (lastUserText) {
        parts.push(
            `lastUser="${trimSummaryText(lastUserText).replaceAll('"', '\\"')}"`,
        )
    }

    return parts.join(' ')
}

async function safeLedgerUpdate(
    action: string,
    fn: () => Promise<void>,
): Promise<void> {
    try {
        await fn()
    } catch (error) {
        console.error(`[ai-runtime][agent-run:${action}] failed`, error)
    }
}

function summarizeContent(value: unknown): {
    contentType: string
    contentLength?: number
    contentPartCount?: number
} {
    if (typeof value === 'string') {
        return { contentType: 'string', contentLength: value.length }
    }

    if (Array.isArray(value)) {
        return { contentType: 'array', contentPartCount: value.length }
    }

    if (value == null) {
        return { contentType: 'none' }
    }

    return { contentType: typeof value }
}

function summarizeProviderMessages(
    messages: unknown[],
): ProviderMessageSummary[] {
    return messages.map((message, index) => {
        if (!isPlainRecord(message)) {
            return {
                index,
                role: 'unknown',
                contentType: typeof message,
                hasAnthropicCacheControl: false,
            }
        }

        const anthropicCacheControl = getAnthropicCacheControl(
            message.providerOptions,
        )

        return {
            index,
            role: typeof message.role === 'string' ? message.role : 'unknown',
            ...summarizeContent(message.content),
            hasAnthropicCacheControl: anthropicCacheControl != null,
            ...(anthropicCacheControl != null ? { anthropicCacheControl } : {}),
        }
    })
}

function listCachedToolNames(
    tools: Record<string, unknown> | undefined,
): string[] {
    if (!tools) return []

    return Object.entries(tools)
        .filter(([, tool]) => {
            if (!isPlainRecord(tool)) return false

            return getAnthropicCacheControl(tool.providerOptions) != null
        })
        .map(([name]) => name)
}

function summarizeCacheControlBreakpoints(params: {
    providerMessages: ProviderMessageSummary[]
    cachedToolNames: string[]
    cachePlan?: ReturnType<typeof buildCachePlan>
}): CacheControlBreakpointsSummary {
    const providerMessageCount = params.providerMessages.filter(
        (message) => message.hasAnthropicCacheControl,
    ).length
    const cachedToolCount = params.cachedToolNames.length

    return {
        count: providerMessageCount + cachedToolCount,
        sources: {
            providerMessages: providerMessageCount,
            tools: cachedToolCount,
            cachePlan: params.cachePlan?.breakpoints.length ?? 0,
        },
    }
}

export async function createAIRuntime(
    options: RuntimeOptions,
): Promise<AIRuntime> {
    const { model, plugins, defaults, agentRunStore, traceRecorder } = options

    validatePluginNames(plugins)

    for (const plugin of plugins) {
        if (plugin.init != null) {
            await plugin.init()
        }
    }

    const baseParams: ChatParams = {
        ...DEFAULT_CHAT_PARAMS,
        ...defaults,
    }

    async function chat(input: ChatInput): Promise<ChatOutput> {
        const runId = input.runId ?? createRunId()
        let runCreated = false
        let traceStarted = false
        let providerRequestStarted = false
        let currentTracePhase: TracePhase = 'created'
        let streamAbortError: Error | undefined
        const recordedFailures = new WeakSet<object>()
        const traceWarnings: TraceWarning[] = []
        const runCtx: RunContext = {
            sessionId: input.sessionId ?? '',
            symbol: input.symbol,
            channel: input.channel,
            mode: input.mode,
            agentType: input.agentType ?? 'trading-agent',
            rawMessages: input.messages,
            meta: new Map(),
        }

        if (input.sourceId) runCtx.meta.set('sourceId', input.sourceId)
        if (input.userId) runCtx.meta.set('userId', input.userId)

        async function writeTraceCheckpoint(
            phase: TracePhase,
            patch: Partial<AgentRunTracePayload>,
            status: TraceStatus = 'recording',
        ): Promise<void> {
            currentTracePhase = phase
            if (!traceStarted) return

            try {
                await traceRecorder.checkpoint(runId, phase, patch, status)
            } catch (error) {
                if (!providerRequestStarted) throw error

                const message =
                    error instanceof Error ? error.message : String(error)
                const warning: TraceWarning = {
                    source: 'trace.recorder',
                    message,
                    data: sanitizeTraceJson({ phase, status }),
                    occurredAt: new Date().toISOString(),
                }
                traceWarnings.push(warning)

                await safeLedgerUpdate('recordWarnings', () =>
                    agentRunStore.recordWarnings(runId, [
                        { source: warning.source, message: warning.message },
                    ]),
                )

                try {
                    await traceRecorder.markIncomplete(runId, error)
                } catch (markError) {
                    console.warn(
                        '[ai-runtime][trace recorder] markIncomplete failed',
                        markError,
                    )
                }
            }
        }

        async function recordFailure(
            error: unknown,
            code?: string,
        ): Promise<void> {
            if (!runCreated) return

            if (
                error != null &&
                (typeof error === 'object' || typeof error === 'function')
            ) {
                if (recordedFailures.has(error)) return
                recordedFailures.add(error)
            }

            const metaSessionId = runCtx.meta.get('sessionId')
            const sessionId =
                typeof metaSessionId === 'string' && metaSessionId.length > 0
                    ? metaSessionId
                    : runCtx.sessionId || undefined
            const failureInput: {
                error: unknown
                code?: string
                sessionId?: string
            } = { error }

            if (code) failureInput.code = code
            if (sessionId) failureInput.sessionId = sessionId

            await safeLedgerUpdate('failIfRunning', () =>
                agentRunStore.failIfRunning(runId, failureInput),
            )

            await writeTraceCheckpoint(
                currentTracePhase,
                {
                    runOutcome: 'failed',
                    failure: buildFailureTrace({
                        phase: currentTracePhase,
                        error,
                    }),
                },
                'complete',
            )
        }

        async function throwIfInputAborted(): Promise<void> {
            if (!input.abortSignal?.aborted) return

            streamAbortError ??= Object.assign(new Error('Stream aborted'), {
                code: 'ABORTED',
            })
            await recordFailure(streamAbortError, 'ABORTED')
            throw streamAbortError
        }

        try {
            await agentRunStore.createRunningRun({
                runId,
                source: input.channel,
                mode: input.mode,
                agentType: input.agentType ?? 'trading-agent',
                ...(input.sessionId ? { sessionId: input.sessionId } : {}),
                ...(input.cronJobId ? { cronJobId: input.cronJobId } : {}),
                ...(input.userId ? { userId: input.userId } : {}),
                ...(input.sourceId ? { sourceId: input.sourceId } : {}),
                inputSummary: buildInputSummary(input),
            })
            runCreated = true
            await traceRecorder.startRun(runId)
            traceStarted = true

            await runBeforeRunHooks(plugins, runCtx)
            await writeTraceCheckpoint('before_run', {})

            const resolvedSessionId = runCtx.meta.get('sessionId')
            if (
                typeof resolvedSessionId === 'string' &&
                resolvedSessionId.length > 0
            ) {
                runCtx.sessionId = resolvedSessionId
                await safeLedgerUpdate('attachSession', () =>
                    agentRunStore.attachSession(runId, resolvedSessionId),
                )
            }

            const collectedOutputs = await collectPluginOutputs(plugins, runCtx)
            const runtimeOwnership = buildRuntimeOwnership(collectedOutputs)
            await writeTraceCheckpoint('collect_context', {
                plugins: buildPluginTrace(collectedOutputs),
            })
            const assembledBase = assembleContextRequest({
                rawMessages: input.messages,
                outputs: collectedOutputs,
                defaults: baseParams,
            })
            const provider = inferProvider(model)
            const rolloutState = getOrCreateCacheRolloutState(
                getCacheRolloutKey({
                    provider,
                    channel: runCtx.channel,
                    mode: runCtx.mode,
                    agentType: runCtx.agentType,
                }),
            )
            const providerOptions = buildProviderOptions(assembledBase.resolved)
            const resolvedMaxOutputTokens = resolveMaxOutputTokens(
                assembledBase.resolved,
            )
            const assembled = {
                ...assembledBase,
                providerOptions,
                resolvedMaxOutputTokens,
            }
            const convertedMessages = (await convertToModelMessages(
                assembled.modelMessages,
            )) as ModelMessage[]
            const assembledSnapshot = {
                segments: assembled.segments,
                systemSegments: assembled.systemSegments,
                tools: assembled.manifestTools,
                params: {
                    candidates: assembled.candidates,
                    resolved: assembled.resolved,
                },
                totalEstimatedInputTokens: assembled.totalEstimatedInputTokens,
            }
            let cacheDisabledReason: string | undefined
            let cachePlan: ReturnType<typeof buildCachePlan> | undefined

            if (rolloutState.disabled) {
                cacheDisabledReason = 'circuit_breaker_open'
            } else {
                try {
                    cachePlan = buildCachePlan({
                        provider,
                        modelId: resolveModelId(model),
                        assembledContext: assembledSnapshot,
                    })
                } catch (error) {
                    rolloutState.plannerFailures += 1
                    if (
                        rolloutState.plannerFailures >= CACHE_FAILURE_THRESHOLD
                    ) {
                        rolloutState.disabled = true
                        cacheDisabledReason = 'circuit_breaker_open'
                    } else {
                        cacheDisabledReason = 'cache_plan_failed'
                    }
                    console.warn(
                        '[ai-runtime][cache planning] failed; continuing without provider cache plan',
                        error,
                    )
                }
            }

            await writeTraceCheckpoint('assemble_context', {
                prompt: buildPromptTrace({
                    assembled,
                    convertedMessages,
                    segmentOwners: runtimeOwnership.segmentOwners,
                    toolOwners: runtimeOwnership.toolOwners,
                }),
                tools: {
                    available: assembled.manifestTools.map((tool) => ({
                        name: tool.name,
                        sourcePlugin:
                            runtimeOwnership.toolOwners.get(tool.name) ??
                            tool.source,
                        category: tool.definition.display?.category,
                    })),
                    calls: [],
                },
                compaction: { applied: false, reason: 'not_implemented' },
            })

            const fallbackProviderCacheRequest = {
                system: assembled.systemText || undefined,
                messages: convertedMessages,
                providerOptions: assembled.providerOptions,
                tools: assembled.aiTools,
            }
            let providerCacheRequest = fallbackProviderCacheRequest
            const shouldUseCacheRequest =
                cachePlan != null &&
                !cacheDisabledReason &&
                cachePlan.eligibility.providerSupportsPromptCache &&
                cachePlan.eligibility.cacheExpected
            const activeCachePlan = shouldUseCacheRequest
                ? cachePlan
                : undefined
            let preparedCacheRequest = false

            if (activeCachePlan) {
                try {
                    providerCacheRequest = buildProviderCacheRequest({
                        provider,
                        cachePlan: activeCachePlan,
                        systemSegments: assembled.systemSegments,
                        modelMessages: convertedMessages,
                        providerOptions: assembled.providerOptions,
                        tools: assembled.aiTools,
                    })
                    preparedCacheRequest = true
                } catch (error) {
                    rolloutState.adapterFailures += 1
                    if (
                        rolloutState.adapterFailures >= CACHE_FAILURE_THRESHOLD
                    ) {
                        rolloutState.disabled = true
                        cacheDisabledReason = 'circuit_breaker_open'
                    } else {
                        cacheDisabledReason = 'cache_adapter_failed'
                    }
                    console.warn(
                        '[ai-runtime][cache adapter] failed; continuing without provider cache request',
                        error,
                    )
                }
            }

            let usedCacheRequest = preparedCacheRequest
            const buildModelRequestSnapshot =
                (): ObservedModelRequestSnapshot => {
                    const providerMessages = summarizeProviderMessages(
                        providerCacheRequest.messages,
                    )
                    const cachedToolNames = listCachedToolNames(
                        providerCacheRequest.tools,
                    )
                    return {
                        systemText: providerCacheRequest.system ?? '',
                        modelMessages: assembled.modelMessages,
                        toolNames: Object.keys(assembled.aiTools),
                        resolvedParams: assembled.resolved,
                        maxOutputTokens: assembled.resolvedMaxOutputTokens,
                        providerOptions: providerCacheRequest.providerOptions,
                        provider,
                        modelId: resolveModelId(model),
                        preparedCacheRequest,
                        usedCacheRequest,
                        providerMessages,
                        cachedToolNames,
                        cachedToolCount: cachedToolNames.length,
                        cacheControlBreakpoints:
                            summarizeCacheControlBreakpoints({
                                providerMessages,
                                cachedToolNames,
                                cachePlan,
                            }),
                    }
                }
            await writeTraceCheckpoint('prepare_model_request', {
                cache: {
                    plan: buildCachePlanTrace(cachePlan),
                    providerRequest: buildCacheProviderRequestTrace(
                        buildModelRequestSnapshot(),
                    ),
                },
            })

            function startStream(
                request: typeof fallbackProviderCacheRequest,
            ): ChatOutput['streamResult'] {
                return streamText({
                    model,
                    system: request.system,
                    messages: request.messages,
                    tools: request.tools as never,
                    stopWhen: stepCountIs(
                        assembled.resolved.maxSteps ?? baseParams.maxSteps,
                    ) as never,
                    temperature: assembled.resolved.temperature,
                    ...(assembled.resolvedMaxOutputTokens != null
                        ? { maxOutputTokens: assembled.resolvedMaxOutputTokens }
                        : {}),
                    ...(Object.keys(request.providerOptions).length > 0
                        ? { providerOptions: request.providerOptions }
                        : {}),
                    abortSignal: input.abortSignal,
                    onError: ({ error }: { error: unknown }) => {
                        void recordFailure(error)
                    },
                    onAbort: () => {
                        streamAbortError ??= new Error('Stream aborted')
                        void recordFailure(streamAbortError, 'ABORTED')
                    },
                } as never) as unknown as ChatOutput['streamResult']
            }

            let streamResult: ChatOutput['streamResult']
            try {
                streamResult = startStream(providerCacheRequest)
                providerRequestStarted = true
                if (usedCacheRequest) {
                    rolloutState.plannerFailures = 0
                    rolloutState.adapterFailures = 0
                }
            } catch (error) {
                if (!preparedCacheRequest) {
                    throw error
                }

                rolloutState.adapterFailures += 1
                if (rolloutState.adapterFailures >= CACHE_FAILURE_THRESHOLD) {
                    rolloutState.disabled = true
                    cacheDisabledReason = 'circuit_breaker_open'
                } else {
                    cacheDisabledReason = 'cache_request_failed'
                }
                console.warn(
                    '[ai-runtime][cache request] failed; retrying without provider cache request',
                    error,
                )

                providerCacheRequest = fallbackProviderCacheRequest
                usedCacheRequest = false
                streamResult = startStream(providerCacheRequest)
                providerRequestStarted = true
            }

            const modelRequestSnapshot = buildModelRequestSnapshot()
            await writeTraceCheckpoint('model_stream', {
                cache: {
                    providerRequest:
                        buildCacheProviderRequestTrace(modelRequestSnapshot),
                },
            })

            let finalizePromise: Promise<void> | undefined
            let finalizedData:
                | {
                      text: string
                      usage: ConsumedResult['usage']
                      toolCalls: ToolCallRecord[]
                      steps: unknown
                      totalUsage?: LanguageModelUsage
                      providerMetadata?: ProviderMetadata
                  }
                | undefined

            async function resolveFinalizedData() {
                if (finalizedData) return finalizedData

                const rawStreamResult = streamResult as unknown as Record<
                    string,
                    unknown
                >
                const [text, usage, steps, totalUsage, providerMetadata] =
                    await Promise.all([
                        streamResult.text,
                        streamResult.usage,
                        streamResult.steps,
                        resolveOptionalStreamValue<LanguageModelUsage>(
                            rawStreamResult.totalUsage,
                        ),
                        resolveOptionalStreamValue<ProviderMetadata>(
                            rawStreamResult.providerMetadata,
                        ),
                    ])

                finalizedData = {
                    text,
                    usage: {
                        inputTokens: usage.inputTokens,
                        outputTokens: usage.outputTokens,
                    },
                    toolCalls: extractToolCalls(steps),
                    steps,
                    totalUsage,
                    providerMetadata,
                }

                return finalizedData
            }

            async function finalize(responseMessage: UIMessage): Promise<void> {
                if (finalizePromise) return finalizePromise

                finalizePromise = (async () => {
                    try {
                        await throwIfInputAborted()

                        const {
                            text,
                            usage,
                            toolCalls,
                            steps,
                            totalUsage,
                            providerMetadata,
                        } = await resolveFinalizedData()
                        const rolloutGateStatus = resolveRolloutGateStatus({
                            circuitBreakerOpen: rolloutState.disabled,
                            usedCacheRequest,
                        })
                        const circuitBreakerState = rolloutState.disabled
                            ? 'open'
                            : 'closed'
                        let cacheResult: ReturnType<
                            typeof normalizeProviderCacheResult
                        >
                        try {
                            cacheResult = normalizeProviderCacheResult({
                                cachePlan,
                                totalUsage,
                                providerMetadata,
                                rolloutGateStatus,
                                circuitBreakerState,
                                cacheDisabledReason,
                            })
                        } catch (error) {
                            console.error(
                                '[ai-runtime][cache normalization] failed; attaching fallback cache result',
                                error,
                            )
                            cacheResult = {
                                cacheObserved: false,
                                evidenceSource: 'none',
                                cacheReadObserved: false,
                                cacheWriteObserved: false,
                                cacheReadEvidenceSource: 'none',
                                cacheWriteEvidenceSource: 'none',
                                cacheDisabledReason:
                                    'cache_result_normalization_failed',
                                rolloutGateStatus,
                                circuitBreakerState,
                            }
                        }

                        await writeTraceCheckpoint('finalize', {
                            result: buildResultTrace({
                                text,
                                responseMessage,
                                usage,
                                provider,
                                modelId: resolveModelId(model),
                            }),
                            tools: buildToolTrace({
                                tools: assembled.manifestTools,
                                toolOwners: runtimeOwnership.toolOwners,
                                steps,
                            }),
                            cache: {
                                result: buildCacheResultTrace(cacheResult),
                            },
                        })

                        await throwIfInputAborted()

                        if (streamAbortError) {
                            await recordFailure(streamAbortError, 'ABORTED')
                            throw streamAbortError
                        }

                        await safeLedgerUpdate('succeedIfRunning', () =>
                            agentRunStore.succeedIfRunning(runId, {
                                messageId: responseMessage.id,
                                outputSummary: text,
                                usage,
                            }),
                        )

                        const warnings = await runAfterRunHooks(plugins, {
                            ...runCtx,
                            text,
                            responseMessage,
                            toolCalls,
                            usage,
                        })

                        if (warnings.length > 0) {
                            await safeLedgerUpdate('recordWarnings', () =>
                                agentRunStore.recordWarnings(runId, warnings),
                            )
                        }

                        const afterRunWarnings = warnings.map((warning) => ({
                            source: warning.source,
                            message: warning.message,
                            occurredAt: new Date().toISOString(),
                        }))
                        await writeTraceCheckpoint(
                            'after_run',
                            {
                                runOutcome: 'succeeded',
                                warnings: [
                                    ...traceWarnings,
                                    ...afterRunWarnings,
                                ],
                            },
                            'complete',
                        )
                    } catch (error) {
                        await recordFailure(error)
                        throw error
                    }
                })()

                return finalizePromise
            }

            async function consumeStream(): Promise<ConsumedResult> {
                let capturedResponseMessage: UIMessage | null = null

                try {
                    const uiStream = streamResult.toUIMessageStream({
                        generateMessageId: createResponseMessageId,
                        sendReasoning: true,
                        onFinish: ({ responseMessage }) => {
                            capturedResponseMessage = responseMessage
                        },
                    })

                    const reader = uiStream.getReader()
                    try {
                        while (true) {
                            const { done } = await reader.read()
                            if (done) break
                        }
                    } finally {
                        reader.releaseLock()
                    }

                    await throwIfInputAborted()

                    if (capturedResponseMessage == null) {
                        throw new Error(
                            'Stream finished without producing a responseMessage',
                        )
                    }

                    await finalize(capturedResponseMessage)
                    const { text, usage, toolCalls } =
                        await resolveFinalizedData()

                    return {
                        text,
                        responseMessage: capturedResponseMessage,
                        toolCalls,
                        usage,
                    }
                } catch (error) {
                    await recordFailure(error)
                    throw error
                }
            }

            return {
                streamResult,
                runId,
                sessionId: runCtx.sessionId,
                consumeStream,
                finalize,
                recordFailure,
            }
        } catch (error) {
            const err =
                error instanceof Error ? error : new Error(String(error))
            await runOnErrorHooks(plugins, runCtx, err)
            await recordFailure(err)
            throw err
        }
    }

    async function dispose(): Promise<void> {
        await Promise.allSettled(
            plugins.map(async (plugin) => {
                if (plugin.destroy == null) return

                try {
                    await plugin.destroy()
                } catch (error) {
                    console.error(`[${plugin.name}] destroy() failed:`, error)
                }
            }),
        )
    }

    return { chat, dispose }
}
