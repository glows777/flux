import { loadMemoryContext as defaultLoadMemory } from '../../memory/loader'
import {
    buildDisplayToolInstructions as defaultBuildDisplayToolInstructions,
    buildGlobalBasePrompt as defaultBuildGlobalBasePrompt,
    buildMemoryToolInstructions as defaultBuildMemoryToolInstructions,
    buildSearchToolInstructions as defaultBuildSearchToolInstructions,
} from '../../prompts'
import type { AIPlugin, ContextSegment } from '../../runtime/types'

interface PromptPluginDeps {
    buildGlobalBasePrompt: typeof defaultBuildGlobalBasePrompt
    buildMemoryToolInstructions: typeof defaultBuildMemoryToolInstructions
    buildDisplayToolInstructions: typeof defaultBuildDisplayToolInstructions
    buildSearchToolInstructions: typeof defaultBuildSearchToolInstructions
    loadMemoryContext: typeof defaultLoadMemory
}

interface PromptPluginOptions {
    deps?: Partial<PromptPluginDeps>
}

export function promptPlugin(options?: PromptPluginOptions): AIPlugin {
    const deps: PromptPluginDeps = {
        buildGlobalBasePrompt: defaultBuildGlobalBasePrompt,
        buildMemoryToolInstructions: defaultBuildMemoryToolInstructions,
        buildDisplayToolInstructions: defaultBuildDisplayToolInstructions,
        buildSearchToolInstructions: defaultBuildSearchToolInstructions,
        loadMemoryContext: defaultLoadMemory,
        ...options?.deps,
    }

    return {
        name: 'prompt',

        async contribute(ctx) {
            const memoryContext = await deps.loadMemoryContext()
            const segments: ContextSegment[] = [
                {
                    id: 'global-base',
                    target: 'system',
                    kind: 'system.base',
                    payload: {
                        format: 'text',
                        text: deps.buildGlobalBasePrompt({ symbol: ctx.symbol }),
                    },
                    source: { plugin: 'prompt' },
                    priority: 'required',
                    cacheability: 'stable',
                    compactability: 'preserve',
                },
                {
                    id: 'global-instructions',
                    target: 'system',
                    kind: 'system.instructions',
                    payload: {
                        format: 'text',
                        text: [
                            deps.buildMemoryToolInstructions(),
                            deps.buildDisplayToolInstructions(),
                            deps.buildSearchToolInstructions(),
                        ].join('\n\n'),
                    },
                    source: { plugin: 'prompt' },
                    priority: 'high',
                    cacheability: 'stable',
                    compactability: 'preserve',
                },
            ]

            if (memoryContext) {
                segments.splice(1, 0, {
                    id: 'memory-context',
                    target: 'system',
                    kind: 'memory.long_lived',
                    payload: { format: 'text', text: memoryContext },
                    source: { plugin: 'prompt' },
                    priority: 'high',
                    cacheability: 'session',
                    compactability: 'summarize',
                })
            }

            return { segments }
        },
    }
}
