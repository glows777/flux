import { TRADING_SECTION } from '../../prompts'
import type {
    AIPlugin,
    ChatParams,
    HookContext,
    ToolMap,
} from '../../runtime/types'

type RawToolMap = Record<string, unknown>
type CreateTradingToolsFn = (...args: unknown[]) => RawToolMap

interface TradingPluginOptions {
    maxSteps?: number
    deps?: { createTradingTools: CreateTradingToolsFn }
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
