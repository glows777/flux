import type { AIPlugin, HookContext } from '../../runtime/types'
import { TRADING_AGENT_PROMPT, buildContext } from '@/core/trading-agent/prompt'
import type { HeartbeatContext } from '@/core/trading-agent/types'

export function autoTradingPromptPlugin(): AIPlugin {
  return {
    name: 'auto-trading-prompt',

    async systemPrompt(ctx: HookContext): Promise<string> {
      const heartbeatCtx = ctx.meta.get('heartbeat') as HeartbeatContext | undefined
      if (!heartbeatCtx) {
        return TRADING_AGENT_PROMPT
      }
      return `${TRADING_AGENT_PROMPT}\n\n${buildContext(heartbeatCtx)}`
    },
  }
}
