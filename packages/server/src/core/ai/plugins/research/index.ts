import type { AIPlugin, ToolDefinition } from '../../runtime/types'
import { createToolContributions } from '../shared/tool-contributions'

type RawToolMap = Record<string, unknown>
type CreateResearchToolsFn = (...args: unknown[]) => RawToolMap

interface ResearchPluginOptions {
    deps?: { createResearchTools: CreateResearchToolsFn }
}

export function researchPlugin(options?: ResearchPluginOptions): AIPlugin {
    if (!options?.deps?.createResearchTools) {
        throw new Error('researchPlugin requires deps.createResearchTools')
    }
    const rawTools = options.deps.createResearchTools()
    const tools: Record<string, ToolDefinition> = {}
    for (const [name, tool] of Object.entries(rawTools)) {
        tools[name] = { tool: tool as never }
    }
    return {
        name: 'research',
        contribute() {
            return { tools: createToolContributions('research', tools) }
        },
    }
}
