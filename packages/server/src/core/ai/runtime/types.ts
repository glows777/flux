import type { LanguageModel, UIMessage, Tool, StreamTextResult } from 'ai'
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

export type ToolMap = Record<string, ToolDefinition>

export type ToolDisplayMap = Record<string, ToolDisplayMeta>

// ── Hook Contexts ──

export type AgentType = 'trading-agent' | 'auto-trading-agent'

export interface HookContext {
  sessionId: string
  symbol?: string
  channel: 'web' | 'discord' | 'cron'
  mode: GatewayMode
  agentType: AgentType
  rawMessages: UIMessage[]
  /** 共享可变存储，hooks 之间传递数据（Vite-style plugin meta） */
  meta: Map<string, unknown>
}

export interface ToolCallRecord {
  toolName: string
  args: unknown
  result: unknown
}

export interface FinishedResult {
  text: string
  usage: { inputTokens: number | undefined; outputTokens: number | undefined }
  toolCalls: ToolCallRecord[]
  reasoning?: string
}

export interface AfterChatContext extends HookContext {
  result: FinishedResult
  responseMessage: UIMessage
  toolCalls: ToolCallRecord[]
}

// ── Chat Params ──

export interface ChatParams {
  maxSteps: number
  temperature?: number
  thinkingBudget?: number
  maxTokens?: number
}

export const DEFAULT_CHAT_PARAMS: ChatParams = {
  maxSteps: 20,
}

// ── Plugin Interface ──

export interface AIPlugin {
  name: string
  init?(): Promise<void>
  destroy?(): Promise<void>

  // Side-effect hook (serial, before everything else)
  beforeChat?(ctx: HookContext): void | Promise<void>

  // Declarative hooks (parallel collect)
  tools?: ToolMap | ((ctx: HookContext) => ToolMap | Promise<ToolMap>)
  systemPrompt?: string | ((ctx: HookContext) => string | Promise<string>)

  // Transform hooks (serial middleware)
  transformMessages?(ctx: HookContext, messages: UIMessage[]): UIMessage[] | Promise<UIMessage[]>
  transformParams?(ctx: HookContext, params: ChatParams): ChatParams | Promise<ChatParams>

  // Finalization hooks (parallel allSettled)
  afterChat?(ctx: AfterChatContext): void | Promise<void>

  // Error hook
  onError?(ctx: HookContext, error: Error): void | Promise<void>
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
}

export interface ChatOutput {
  streamResult: StreamTextResult<any, any>
  sessionId: string
  consumeStream(): Promise<ConsumedResult>
  finalize(responseMessage: UIMessage): Promise<void>
}

export interface AIRuntime {
  chat(input: ChatInput): Promise<ChatOutput>
  getToolDisplayMap(): ToolDisplayMap
  dispose(): Promise<void>
}
