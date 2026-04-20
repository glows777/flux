import { createTradingAgentTools } from '@/core/trading-agent/tools'
import type { TradingAgentDeps } from '@/core/trading-agent/types'
import type { AIPlugin, ToolDefinition } from '../../runtime/types'
import { createToolContributions } from '../shared/tool-contributions'

export interface AutoTradingToolsPluginDeps {
    tradingAgentDeps: TradingAgentDeps
}

export function autoTradingToolsPlugin(
    deps: AutoTradingToolsPluginDeps,
): AIPlugin {
    const allTools = createTradingAgentTools(deps.tradingAgentDeps)

    // Exclude memory tools (provided by shared memoryPlugin) to avoid ToolConflictError
    const MEMORY_TOOL_NAMES = new Set([
        'memory_read',
        'memory_write',
        'memory_list',
    ])

    const tools: Record<string, ToolDefinition> = {}
    for (const [name, tool] of Object.entries(allTools)) {
        if (!MEMORY_TOOL_NAMES.has(name)) {
            tools[name] = { tool: tool as never }
        }
    }

    return {
        name: 'auto-trading-tools',
        contribute() {
            return {
                tools: createToolContributions('auto-trading-tools', tools),
            }
        },
    }
}
