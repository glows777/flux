import type { ModelMessage } from 'ai'
import type { AgentType, ChatParams } from '@/core/ai/runtime/types'
import type { GatewayMode } from '@/gateway/router'
import type { SafeTraceJson } from './json'

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

export interface TraceWarning {
    source: string
    message: string
    data?: SafeTraceJson
    occurredAt?: string
}

export interface ParamsTrace {
    resolved: Partial<ChatParams>
    candidates: Array<{
        plugin: string
        key: keyof ChatParams
        value: unknown
    }>
}

export interface ToolSummary {
    name: string
    description?: string
    inputSchemaSummary?: unknown
    sourcePlugin: string
    category?: 'data' | 'display' | 'memory' | 'trading' | 'research'
    estimatedTokens?: number
}

export interface SystemSegmentTrace {
    id: string
    target: 'system'
    kind: string
    sourcePlugin: string
    origin?: string
    finalOrder: number
    content: { format: 'text'; text: string }
    contentHash: string
    estimatedTokens?: number
    cacheability: 'stable' | 'session' | 'volatile' | 'none'
    compactability: 'preserve' | 'summarize' | 'trim'
}

export interface MessageSegmentTrace {
    id: string
    target: 'messages'
    kind: string
    sourcePlugin: string
    origin?: string
    messageIds: string[]
    messageCount: number
    roles: string[]
    contentHash: string
    cacheability: 'stable' | 'session' | 'volatile' | 'none'
    compactability: 'preserve' | 'summarize' | 'trim'
}

export interface PromptTrace {
    finalInput: {
        systemText: string
        modelMessages: ModelMessage[]
        tools: ToolSummary[]
        params: ParamsTrace
    }
    segments: Array<SystemSegmentTrace | MessageSegmentTrace>
    totalEstimatedInputTokens: number
}

export interface PluginTrace {
    contributions: Array<{
        plugin: string
        segmentIds: string[]
        toolNames: string[]
        paramKeys: string[]
        diagnosticCount: number
    }>
    diagnostics: Array<{
        plugin: string
        level: 'debug' | 'info' | 'warn' | 'error'
        message: string
        origin?: string
        data?: SafeTraceJson
    }>
}

export interface ToolTrace {
    available: Array<{
        name: string
        sourcePlugin: string
        category?: 'data' | 'display' | 'memory' | 'trading' | 'research'
    }>
    calls: ToolCallTrace[]
}

export interface ToolCallTrace {
    index: number
    stepIndex?: number
    toolName: string
    toolCallId?: string
    args: SafeTraceJson
    result?: SafeTraceJson
    status: 'succeeded' | 'failed' | 'unknown'
    error?: {
        message: string
        name?: string
        code?: string
    }
}

export interface CacheTrace {
    plan?: CachePlanTrace
    providerRequest?: CacheProviderRequestTrace
    result?: CacheResultTrace
}

export interface CachePlanTrace {
    provider: 'anthropic' | 'openai' | 'unknown'
    modelId?: string
    stableCoreSegmentIds: string[]
    cacheableSessionSegmentIds: string[]
    dynamicTailSegmentIds: string[]
    effectivePrefixSegmentIds: string[]
    effectivePrefixEstimatedTokens: number
    hashes: {
        toolDefinitionsHash: string
        systemHash: string
        memoryHash: string
        dynamicTailHash: string
    }
    eligibility: {
        providerSupportsPromptCache: boolean
        prefixAboveThreshold: boolean
        minCacheablePrefixTokens?: number
        cacheExpected: boolean
        cacheExpectationReason: string
        providerRuleAssumptions: string[]
    }
}

export interface CacheProviderRequestTrace {
    preparedCacheRequest: boolean
    usedCacheRequest: boolean
    providerOptions: SafeTraceJson
    providerMessages: Array<{
        index: number
        role: string
        contentType: string
        contentLength?: number
        contentPartCount?: number
        hasAnthropicCacheControl: boolean
        anthropicCacheControl?: unknown
    }>
    cachedToolNames: string[]
    cachedToolCount: number
    cacheControlBreakpoints: {
        count: number
        sources: {
            providerMessages: number
            tools: number
            cachePlan: number
        }
    }
}

export type CacheEvidenceSource =
    | 'totalUsage'
    | 'providerMetadata'
    | 'both'
    | 'none'

export interface CacheResultTrace {
    cacheObserved: boolean
    evidenceSource: CacheEvidenceSource
    cacheReadObserved: boolean
    cacheWriteObserved: boolean
    cacheReadEvidenceSource: CacheEvidenceSource
    cacheWriteEvidenceSource: CacheEvidenceSource
    cacheReadTokens?: number
    cacheWriteTokens?: number
    uncachedInputTokens?: number
    cachedTokenRatio?: number
    providerRawCacheUsage?: SafeTraceJson
    cacheDisabledReason?: string
    rolloutGateStatus: 'observe-only' | 'enabled' | 'disabled'
    circuitBreakerState: 'closed' | 'open'
}

export interface CompactionTrace {
    applied: boolean
    reason:
        | 'not_needed'
        | 'not_implemented'
        | 'token_budget'
        | 'manual'
        | 'failed'
    beforeEstimatedInputTokens?: number
    afterEstimatedInputTokens?: number
    affectedSegmentIds?: string[]
    error?: { message: string; code?: string }
}

export interface ResultTrace {
    finishReason?: string
    finalOutput: {
        text: string
        textHash: string
        messageId?: string
        partsSummary?: {
            textPartCount: number
            reasoningPartCount: number
            toolPartCount: number
            otherPartCount: number
        }
    }
    usage: {
        inputTokens?: number
        outputTokens?: number
        totalTokens?: number
        reasoningTokens?: number
        cachedInputTokens?: number
    }
    provider: {
        id: 'anthropic' | 'openai' | 'unknown'
        modelId?: string
        responseId?: string
        systemFingerprint?: string
    }
}

export interface FailureTrace {
    phase: TracePhase
    sourcePlugin?: string
    hookName?: 'beforeRun' | 'contribute' | 'afterRun' | 'onError'
    sourceTool?: string
    source?: 'cron_executor' | 'gateway' | 'runtime'
    error: {
        message: string
        name?: string
        code?: string
        stack?: string
    }
    occurredAt: string
}

export interface AgentRunTracePayload {
    version: 1
    runId: string
    traceStatus: TraceStatus
    runOutcome: RunOutcome
    currentPhase: TracePhase
    completedPhases: TracePhase[]
    prompt?: PromptTrace
    plugins?: PluginTrace
    tools?: ToolTrace
    cache?: CacheTrace
    compaction?: CompactionTrace
    result?: ResultTrace
    failure?: FailureTrace
    warnings?: TraceWarning[]
    recordingError?: {
        message: string
        code?: string
        occurredAt: string
    }
    updatedAt: string
}

export interface MinimalFailureTraceInput {
    runId: string
    source: 'cron_executor' | 'gateway' | 'runtime'
    phase: TracePhase
    error: unknown
    runContext?: {
        source?: string
        mode?: GatewayMode
        agentType?: AgentType
        cronJobId?: string
        userId?: string
        sourceId?: string
    }
}
