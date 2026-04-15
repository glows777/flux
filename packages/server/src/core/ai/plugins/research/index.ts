import type { AIPlugin, ToolMap } from '../../runtime/types'

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
    const tools: ToolMap = {}
    for (const [name, tool] of Object.entries(rawTools)) {
        tools[name] = { tool }
    }
    return { name: 'research', tools }
}
