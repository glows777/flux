import type { AIPlugin, ToolDefinition } from '../../runtime/types'
import { createToolContributions } from '../shared/tool-contributions'

type RawToolMap = Record<string, unknown>
type CreateToolsFn = (...args: unknown[]) => RawToolMap

const DISPLAY_TOOL_NAMES = new Set([
    'display_rating_card',
    'display_comparison_table',
    'display_signal_badges',
])

interface DataPluginDeps {
    createTools: CreateToolsFn
}

interface DataPluginOptions {
    deps?: DataPluginDeps
}

function wrapToolsAsDefinitions(
    rawTools: RawToolMap,
): Record<string, ToolDefinition> {
    const map: Record<string, ToolDefinition> = {}
    for (const [name, tool] of Object.entries(rawTools)) {
        map[name] = { tool: tool as never }
    }
    return map
}

export function dataPlugin(options?: DataPluginOptions): AIPlugin {
    const createTools = options?.deps?.createTools
    if (!createTools) {
        throw new Error(
            'dataPlugin requires deps.createTools or production toolDeps to be provided',
        )
    }

    const allTools = createTools()
    const filtered: RawToolMap = {}
    for (const [name, tool] of Object.entries(allTools)) {
        if (!DISPLAY_TOOL_NAMES.has(name)) filtered[name] = tool
    }

    return {
        name: 'data',
        contribute() {
            return {
                tools: createToolContributions(
                    'data',
                    wrapToolsAsDefinitions(filtered),
                ),
            }
        },
    }
}
