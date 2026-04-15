import { loadMemoryContext as defaultLoadMemory } from '../../memory/loader'
import { buildGlobalSystemPrompt as defaultBuildGlobal } from '../../prompts'
import type { AIPlugin, HookContext } from '../../runtime/types'

interface PromptPluginDeps {
    buildGlobalSystemPrompt: typeof defaultBuildGlobal
    loadMemoryContext: typeof defaultLoadMemory
}

interface PromptPluginOptions {
    deps?: Partial<PromptPluginDeps>
}

export function promptPlugin(options?: PromptPluginOptions): AIPlugin {
    const deps: PromptPluginDeps = {
        buildGlobalSystemPrompt: defaultBuildGlobal,
        loadMemoryContext: defaultLoadMemory,
        ...options?.deps,
    }

    return {
        name: 'prompt',

        async systemPrompt(_ctx: HookContext): Promise<string> {
            const memoryContext = await deps.loadMemoryContext()
            return deps.buildGlobalSystemPrompt({ memoryContext })
        },
    }
}
