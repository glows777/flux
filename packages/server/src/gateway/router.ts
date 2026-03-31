import { generateId } from 'ai'
import type { UIMessage } from 'ai'
import type { AgentType, AIRuntime, ChatOutput } from '@/core/ai/runtime/types'
import { clearChannelSession } from '@/core/ai/session'

export interface GatewayInput {
  readonly channel: 'web' | 'discord' | 'cron'
  readonly agentType?: AgentType
  readonly messages?: UIMessage[]
  readonly content?: string
  readonly sessionId?: string
  readonly channelId?: string
  readonly userId?: string
  readonly symbol?: string
}

interface GatewayDeps {
  readonly runtimes: Record<AgentType, AIRuntime>
}

export class GatewayRouter {
  constructor(private readonly deps: GatewayDeps) {}

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
      channelId: input.channelId,
      userId: input.userId,
    })
  }

  async clearSession(params: {
    readonly channel: string
    readonly channelSessionId: string
    readonly channelUserId: string
  }): Promise<{ id: string }> {
    return clearChannelSession(params)
  }
}
