import type { AIPlugin, ToolDefinition } from '../../runtime/types'
import { createToolContributions } from '../shared/tool-contributions'

type RawToolMap = Record<string, unknown>
type CreateToolsFn = (...args: unknown[]) => RawToolMap

const DISPLAY_TOOL_NAMES = new Set([
    'display_rating_card',
    'display_comparison_table',
    'display_signal_badges',
])

interface DisplayPluginOptions {
    deps?: { createTools: CreateToolsFn }
}

export function displayPlugin(options?: DisplayPluginOptions): AIPlugin {
    if (!options?.deps?.createTools) {
        throw new Error('displayPlugin requires deps.createTools')
    }
    const allTools = options.deps.createTools()
    const tools: Record<string, ToolDefinition> = {}
    for (const [name, tool] of Object.entries(allTools)) {
        if (DISPLAY_TOOL_NAMES.has(name)) tools[name] = { tool: tool as never }
    }
    return {
        name: 'display',
        contribute() {
            return { tools: createToolContributions('display', tools) }
        },
    }
}
