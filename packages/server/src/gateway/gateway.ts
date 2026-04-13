import type { ChannelAdapter } from '@/channels/types'
import type { ChatOutput } from '@/core/ai/runtime/types'
import type { Router } from './router'
import type { GatewayInput, TriggerResult } from './router'

interface GatewayDeps {
  readonly router: Router
  readonly channels: Map<string, ChannelAdapter>
}

export class Gateway {
  constructor(private readonly deps: GatewayDeps) {}

  async chat(input: GatewayInput & { mode: 'conversation' }): Promise<ChatOutput>
  async chat(input: GatewayInput & { mode: 'trigger' }): Promise<TriggerResult>
  async chat(input: GatewayInput): Promise<ChatOutput | TriggerResult> {
    if (input.mode === 'trigger') {
      return this.handleTrigger(input)
    }
    return this.deps.router.chat(input)
  }

  async clearSession(params: {
    readonly channel: string
    readonly sourceId: string
    readonly createdBy: string
  }): Promise<{ id: string }> {
    return this.deps.router.clearSession(params)
  }

  private async handleTrigger(input: GatewayInput): Promise<TriggerResult> {
    let output: ChatOutput
    try {
      output = await this.deps.router.chat(input)
    } catch (error) {
      console.error('Gateway trigger AI execution failed:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { text: '', sessionId: '', success: false, error: message }
    }

    const { text } = await output.consumeStream()

    if (input.channelTarget) {
      const adapter = this.deps.channels.get(input.channelTarget.type)
      if (adapter) {
        try {
          await adapter.send(
            { channelId: input.channelTarget.channelId },
            { content: text },
          )
        } catch (error) {
          console.error(`Gateway push to ${input.channelTarget.type} failed:`, error)
        }
      }
    }

    return { text, sessionId: output.sessionId, success: true }
  }
}
