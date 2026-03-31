import type { AIPlugin, HookContext } from '../../runtime/types'
import {
  buildGlobalSystemPrompt as defaultBuildGlobal,
} from '../../prompts'
import { loadMemoryContext as defaultLoadMemory } from '../../memory/loader'

interface PromptPluginDeps {
  buildGlobalSystemPrompt: (...args: any[]) => string
  loadMemoryContext: (symbol?: string, options?: any) => Promise<string>
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
