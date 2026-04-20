import { TRADING_SECTION } from '../../prompts'
import type {
    AIPlugin,
    ToolContribution,
    ToolDefinition,
} from '../../runtime/types'

type RawToolMap = Record<string, unknown>
type CreateTradingToolsFn = (...args: unknown[]) => RawToolMap

interface TradingPluginOptions {
    maxSteps?: number
    deps?: { createTradingTools: CreateTradingToolsFn }
}

function createToolContributions(rawTools: RawToolMap): ToolContribution[] {
    return Object.entries(rawTools).map(([name, tool]) => {
        const definition: ToolDefinition = { tool: tool as never }

        return {
            name,
            definition,
            source: 'trading',
            manifestSpec: {
                description: (tool as { description?: string }).description,
                inputSchemaSummary: (tool as { inputSchema?: unknown })
                    .inputSchema,
            },
        }
    })
}

export function tradingPlugin(options?: TradingPluginOptions): AIPlugin {
    if (!options?.deps?.createTradingTools) {
        throw new Error('tradingPlugin requires deps.createTradingTools')
    }
    const maxSteps = options?.maxSteps ?? 50
    const allTools = options.deps.createTradingTools()
    const tools = createToolContributions(allTools)

    return {
        name: 'trading',
        contribute() {
            return {
                segments: [
                    {
                        id: 'trading-instructions',
                        target: 'system',
                        kind: 'system.instructions',
                        payload: { format: 'text', text: TRADING_SECTION },
                        source: { plugin: 'trading' },
                        priority: 'high',
                        cacheability: 'stable',
                        compactability: 'preserve',
                    },
                ],
                tools,
                params: { maxSteps },
            }
        },
    }
}
