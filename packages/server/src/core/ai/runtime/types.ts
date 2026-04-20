import type {
    LanguageModel,
    StreamTextResult,
    Tool,
    UIMessage,
} from 'ai'
import type { GatewayMode } from '@/gateway/router'

// ── Tool Definition ──

export interface ToolDisplayMeta {
    loadingLabel: (input: unknown) => string
    completionSummary: (output: unknown) => string
    category: 'data' | 'display' | 'memory' | 'trading' | 'research'
}

export interface ToolDefinition {
    tool: Tool
    display?: ToolDisplayMeta
}

export type ToolDisplayMap = Record<string, ToolDisplayMeta>

// ── Core Runtime Types ──

export type AgentType = 'trading-agent' | 'auto-trading-agent'

export interface ToolCallRecord {
    toolName: string
    args: unknown
    result: unknown
}

export interface ChatParams {
    maxSteps: number
    temperature?: number
    thinkingBudget?: number
    maxTokens?: number
}

export const DEFAULT_CHAT_PARAMS: ChatParams = {
    maxSteps: 20,
}

export interface RunContext {
    sessionId: string
    symbol?: string
    channel: 'web' | 'discord' | 'cron'
    mode: GatewayMode
    agentType: AgentType
    rawMessages: UIMessage[]
    /** Shared mutable storage passed across plugin hooks */
    meta: Map<string, unknown>
}

export interface AfterRunContext extends RunContext {
    text: string
    responseMessage: UIMessage
    toolCalls: ToolCallRecord[]
    usage: { inputTokens: number | undefined; outputTokens: number | undefined }
    contextManifest: ContextManifest
}

// ── Context Manifest ──

export interface ContextSegment {
    readonly id: string
    readonly target: 'system' | 'messages'
    readonly kind:
        | 'system.base'
        | 'system.instructions'
        | 'memory.long_lived'
        | 'history.recent'
        | 'live.runtime'
    readonly payload:
        | { format: 'text'; text: string }
        | { format: 'messages'; messages: UIMessage[] }
    readonly source: {
        readonly plugin: string
        readonly origin?: string
    }
    readonly priority: 'required' | 'high' | 'medium' | 'low'
    readonly cacheability: 'stable' | 'session' | 'volatile' | 'none'
    readonly compactability: 'preserve' | 'summarize' | 'trim'
}

export interface ToolContribution {
    readonly name: string
    readonly definition: ToolDefinition
    readonly source: string
    readonly manifestSpec: {
        readonly description?: string
        readonly inputSchemaSummary?: unknown
    }
}

export interface PluginDiagnostic {
    readonly plugin: string
    readonly level: 'debug' | 'info' | 'warn' | 'error'
    readonly message: string
    readonly origin?: string
    readonly data?: unknown
}

export interface ManifestInputSnapshot {
    readonly channel: RunContext['channel']
    readonly mode: RunContext['mode']
    readonly agentType: RunContext['agentType']
    readonly rawMessages: RunContext['rawMessages']
    readonly initialSessionId?: string
    readonly resolvedSessionId?: string
    readonly defaults: Record<string, unknown>
}

export interface PluginOutputSnapshot {
    readonly plugin: string
    readonly output: PluginOutput
}

export interface AssembledParamsSnapshot {
    readonly candidates: Array<{
        readonly plugin: string
        readonly key: keyof ChatParams
        readonly value: ChatParams[keyof ChatParams]
    }>
    readonly resolved: Partial<ChatParams>
}

export interface AssembledContextSnapshot {
    readonly segments: ContextSegment[]
    readonly tools: ToolContribution[]
    readonly params: AssembledParamsSnapshot
    readonly totalEstimatedInputTokens: number
}

export interface ModelRequestSnapshot {
    readonly systemText: string
    readonly modelMessages: UIMessage[]
    readonly toolNames: string[]
    readonly resolvedParams: Partial<ChatParams>
    readonly providerOptions: Record<string, unknown>
}

export interface ResultSnapshot {
    readonly text: string
    readonly responseMessage: UIMessage
    readonly toolCalls: ToolCallRecord[]
    readonly usage: {
        readonly inputTokens: number | undefined
        readonly outputTokens: number | undefined
    }
}

export interface ContextManifest {
    readonly runId: string
    readonly createdAt: string
    readonly input: ManifestInputSnapshot
    readonly pluginOutputs: PluginOutputSnapshot[]
    readonly assembledContext: AssembledContextSnapshot
    readonly modelRequest: ModelRequestSnapshot
    readonly result?: ResultSnapshot
}

// ── Plugin Interface ──

export interface PluginOutput {
    readonly segments?: ContextSegment[]
    readonly tools?: ToolContribution[]
    readonly params?: Partial<ChatParams>
    readonly diagnostics?: PluginDiagnostic[]
}

export interface AIPlugin {
    name: string
    init?(): Promise<void>
    destroy?(): Promise<void>
    beforeRun?(ctx: RunContext): void | Promise<void>
    contribute?(ctx: RunContext): PluginOutput | Promise<PluginOutput>
    afterRun?(ctx: AfterRunContext): void | Promise<void>
    onError?(ctx: RunContext, error: Error): void | Promise<void>
}

// ── Runtime Interfaces ──

export interface RuntimeOptions {
    model: LanguageModel
    plugins: AIPlugin[]
    defaults?: Partial<ChatParams>
}

export interface ChatInput {
    sessionId?: string
    messages: UIMessage[]
    symbol?: string
    channel: 'web' | 'discord' | 'cron'
    mode: GatewayMode
    agentType?: AgentType
    sourceId?: string
    userId?: string
}

export interface ConsumedResult {
    text: string
    responseMessage: UIMessage
    toolCalls: ToolCallRecord[]
    usage: { inputTokens: number | undefined; outputTokens: number | undefined }
    contextManifest: ContextManifest
}

export interface ChatOutput {
    // streamText()'s generics are constrained (TOOLS extends ToolSet, OUTPUT extends Output).
    // We intentionally keep this surface loose during the migration.
    streamResult: StreamTextResult<any, any>
    sessionId: string
    consumeStream(): Promise<ConsumedResult>
    finalize(responseMessage: UIMessage): Promise<void>
    getContextManifest(): ContextManifest
}

export interface AIRuntime {
    chat(input: ChatInput): Promise<ChatOutput>
    dispose(): Promise<void>
}
