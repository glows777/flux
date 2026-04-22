import type { LanguageModelUsage, ProviderMetadata, UIMessage } from 'ai'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { assembleContextRequest } from './assembly'
import { buildCachePlan } from './cache-plan'
import {
    attachCachePlanSnapshot,
    attachCacheResultSnapshot,
    attachAssembledContextSnapshot,
    attachModelRequestSnapshot,
    attachPluginOutputsSnapshot,
    attachResultSnapshot,
    createBaseManifest,
} from './context-manifest'
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
    RunContext,
    RuntimeOptions,
    ToolCallRecord,
} from './types'
import { DEFAULT_CHAT_PARAMS } from './types'

interface StepWithToolCalls {
    readonly toolCalls?: Array<{
        readonly toolName: string
        readonly args: unknown
    }>
    readonly toolResults?: Array<{
        readonly result?: unknown
    }>
}

type ProviderKind = 'anthropic' | 'openai' | 'unknown'

const CACHE_FAILURE_THRESHOLD = 3

interface CacheRolloutState {
    plannerFailures: number
    adapterFailures: number
    disabled: boolean
}

const cacheRolloutStates = new Map<string, CacheRolloutState>()

export function __resetCacheRolloutStatesForTests(): void {
    cacheRolloutStates.clear()
}

function createRunId(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return crypto.randomUUID()
    }

    return `run_${Math.random().toString(16).slice(2)}_${Date.now()}`
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
    circuitBreakerWasOpenAtStart: boolean
    usedCacheRequest: boolean
}): 'observe-only' | 'enabled' | 'disabled' {
    if (params.circuitBreakerWasOpenAtStart) return 'disabled'
    return params.usedCacheRequest ? 'enabled' : 'observe-only'
}

export async function createAIRuntime(
    options: RuntimeOptions,
): Promise<AIRuntime> {
    const { model, plugins, defaults } = options

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
        const runId = createRunId()
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

        try {
            await runBeforeRunHooks(plugins, runCtx)

            if (runCtx.meta.has('sessionId')) {
                runCtx.sessionId = runCtx.meta.get('sessionId') as string
            }

            const collectedOutputs = await collectPluginOutputs(plugins, runCtx)
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
            const circuitBreakerWasOpenAtStart = rolloutState.disabled
            const providerOptions = buildProviderOptions(assembledBase.resolved)
            const resolvedMaxOutputTokens = resolveMaxOutputTokens(
                assembledBase.resolved,
            )
            const assembled = {
                ...assembledBase,
                providerOptions,
                resolvedMaxOutputTokens,
            }
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
            let cachePlan:
                | ReturnType<typeof buildCachePlan>
                | undefined

            if (rolloutState.disabled) {
                cacheDisabledReason = 'circuit_breaker_open'
            } else {
                try {
                    cachePlan = buildCachePlan({
                        provider,
                        modelId: resolveModelId(model),
                        assembledContext: assembledSnapshot,
                        providerChangeFlags: {},
                    })
                } catch (error) {
                    rolloutState.plannerFailures += 1
                    if (
                        rolloutState.plannerFailures >=
                        CACHE_FAILURE_THRESHOLD
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

            let manifest = createBaseManifest({
                runId,
                input,
                resolvedSessionId: runCtx.sessionId || undefined,
                defaults: baseParams as unknown as Record<string, unknown>,
            })

            manifest = attachPluginOutputsSnapshot(manifest, collectedOutputs)
            manifest = attachAssembledContextSnapshot(manifest, assembledSnapshot)
            if (cachePlan) {
                manifest = attachCachePlanSnapshot(manifest, cachePlan)
            }

            const convertedMessages = await convertToModelMessages(
                assembled.modelMessages,
            )
            const fallbackProviderCacheRequest = {
                system: assembled.systemText || undefined,
                messages: convertedMessages,
                providerOptions: assembled.providerOptions,
            }
            let providerCacheRequest = fallbackProviderCacheRequest
            let usedCacheRequest = false

            if (cachePlan && !cacheDisabledReason) {
                try {
                    providerCacheRequest = buildProviderCacheRequest({
                        provider,
                        cachePlan,
                        systemSegments: assembled.systemSegments,
                        modelMessages: convertedMessages,
                        providerOptions: assembled.providerOptions,
                    })
                } catch (error) {
                    rolloutState.adapterFailures += 1
                    if (
                        rolloutState.adapterFailures >=
                        CACHE_FAILURE_THRESHOLD
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

            function startStream(
                request: typeof fallbackProviderCacheRequest,
            ): ChatOutput['streamResult'] {
                return streamText({
                    model,
                    system: request.system,
                    messages: request.messages,
                    tools: assembled.aiTools as never,
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
                } as never) as unknown as ChatOutput['streamResult']
            }

            let streamResult: ChatOutput['streamResult']
            try {
                streamResult = startStream(providerCacheRequest)
                usedCacheRequest = providerCacheRequest !== fallbackProviderCacheRequest
                if (usedCacheRequest) {
                    rolloutState.plannerFailures = 0
                    rolloutState.adapterFailures = 0
                }
            } catch (error) {
                const attemptedCacheRequest =
                    providerCacheRequest !== fallbackProviderCacheRequest
                if (!attemptedCacheRequest) {
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
                streamResult = startStream(providerCacheRequest)
            }

            manifest = attachModelRequestSnapshot(manifest, {
                systemText: (providerCacheRequest.system ?? '') as never,
                modelMessages: providerCacheRequest.messages as never,
                toolNames: Object.keys(assembled.aiTools),
                resolvedParams: assembled.resolved,
                maxOutputTokens: assembled.resolvedMaxOutputTokens,
                providerOptions: providerCacheRequest.providerOptions,
            })

            let finalized = false
            let finalizedData:
                | {
                      text: string
                      usage: ConsumedResult['usage']
                      toolCalls: ToolCallRecord[]
                      totalUsage?: LanguageModelUsage
                      providerMetadata?: ProviderMetadata
                  }
                | undefined

            async function resolveFinalizedData() {
                if (finalizedData) return finalizedData

                const rawStreamResult = streamResult as Record<string, unknown>
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
                    totalUsage,
                    providerMetadata,
                }

                return finalizedData
            }

            async function finalize(responseMessage: UIMessage): Promise<void> {
                if (finalized) return
                finalized = true

                const {
                    text,
                    usage,
                    toolCalls,
                    totalUsage,
                    providerMetadata,
                } = await resolveFinalizedData()
                const rolloutGateStatus = resolveRolloutGateStatus({
                    circuitBreakerWasOpenAtStart,
                    usedCacheRequest,
                })
                const circuitBreakerState = rolloutState.disabled
                    ? 'open'
                    : 'closed'
                manifest = attachResultSnapshot(manifest, {
                    text,
                    responseMessage,
                    toolCalls,
                    usage,
                })
                try {
                    manifest = attachCacheResultSnapshot(
                        manifest,
                        normalizeProviderCacheResult({
                            cachePlan,
                            totalUsage,
                            providerMetadata,
                            rolloutGateStatus,
                            circuitBreakerState,
                            cacheDisabledReason,
                        }),
                    )
                } catch (error) {
                    console.error(
                        '[ai-runtime][cache normalization] failed; attaching fallback cache result',
                        error,
                    )
                    manifest = attachCacheResultSnapshot(manifest, {
                        cacheObserved: false,
                        cacheDisabledReason:
                            'cache_result_normalization_failed',
                        rolloutGateStatus,
                        circuitBreakerState,
                    })
                }

                await runAfterRunHooks(plugins, {
                    ...runCtx,
                    text,
                    responseMessage,
                    toolCalls,
                    usage,
                    contextManifest: manifest,
                })
            }

            async function consumeStream(): Promise<ConsumedResult> {
                let capturedResponseMessage: UIMessage | null = null

                const uiStream = streamResult.toUIMessageStream({
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

                if (capturedResponseMessage == null) {
                    throw new Error(
                        'Stream finished without producing a responseMessage',
                    )
                }

                await finalize(capturedResponseMessage)
                const { text, usage, toolCalls } = await resolveFinalizedData()

                return {
                    text,
                    responseMessage: capturedResponseMessage,
                    toolCalls,
                    usage,
                    contextManifest: manifest,
                }
            }

            return {
                streamResult,
                sessionId: runCtx.sessionId,
                consumeStream,
                finalize,
                getContextManifest: () => manifest,
            }
        } catch (error) {
            const err =
                error instanceof Error ? error : new Error(String(error))
            await runOnErrorHooks(plugins, runCtx, err)
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
