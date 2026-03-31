import type { AIPlugin, HookContext, ChatParams, ToolMap } from '../../runtime/types'
import { TRADING_SECTION } from '../../prompts'

interface TradingPluginOptions {
  maxSteps?: number
  deps?: { createTradingTools: (...args: any[]) => Record<string, any> }
}

export function tradingPlugin(options?: TradingPluginOptions): AIPlugin {
  if (!options?.deps?.createTradingTools) {
    throw new Error('tradingPlugin requires deps.createTradingTools')
  }
  const maxSteps = options?.maxSteps ?? 50
  const allTools = options.deps.createTradingTools()
  const tools: ToolMap = {}

  for (const [name, tool] of Object.entries(allTools)) {
    tools[name] = { tool }
  }

  return {
    name: 'trading',
    tools,
    systemPrompt: TRADING_SECTION,
    transformParams(_ctx: HookContext, params: ChatParams): ChatParams {
      return { ...params, maxSteps }
    },
  }
}
