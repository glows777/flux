import { generateId } from 'ai'
import type { UIMessage } from 'ai'
import type { AgentType, AIRuntime, ChatOutput } from '@/core/ai/runtime/types'
import { clearChannelSession } from '@/core/ai/session'

export type GatewayMode = 'conversation' | 'trigger'

export interface GatewayInput {
  readonly channel: 'web' | 'discord' | 'cron'
  readonly mode: GatewayMode
  readonly agentType?: AgentType
  readonly messages?: UIMessage[]
  readonly content?: string
  readonly sessionId?: string
  readonly sourceId?: string
  readonly userId?: string
  readonly symbol?: string
  readonly channelTarget?: { readonly type: string; readonly channelId: string }
}

export interface TriggerResult {
  readonly text: string
  readonly sessionId: string
  readonly success: boolean
}

interface RouterDeps {
  readonly runtimes: Record<AgentType, AIRuntime>
}

export class Router {
  constructor(private readonly deps: RouterDeps) {}

  async chat(input: GatewayInput): Promise<ChatOutput> {
    const agentType = input.agentType ?? 'trading-agent'
    const runtime = this.deps.runtimes[agentType]

    if (!runtime) {
      throw new Error(`Unknown agent type: ${agentType}`)
    }

    // Convert content to UIMessage[] if needed
    const messages: UIMessage[] = input.messages ?? [{
      id: generateId(),
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: input.content ?? '' }],
    }]

    return runtime.chat({
      sessionId: input.sessionId,
      messages,
      symbol: input.symbol,
      channel: input.channel,
      agentType,
      mode: input.mode,
      sourceId: input.sourceId,
      userId: input.userId,
    })
  }

  async clearSession(params: {
    readonly channel: string
    readonly sourceId: string
    readonly createdBy: string
  }): Promise<{ id: string }> {
    return clearChannelSession(params)
  }
}
