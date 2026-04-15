import type { AIPlugin, ToolMap } from '../../runtime/types'

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
    const tools: ToolMap = {}
    for (const [name, tool] of Object.entries(allTools)) {
        if (DISPLAY_TOOL_NAMES.has(name)) tools[name] = { tool }
    }
    return { name: 'display', tools }
}
