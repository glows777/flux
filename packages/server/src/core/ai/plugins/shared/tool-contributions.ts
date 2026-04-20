import type { ToolContribution, ToolDefinition } from '../../runtime/types'

export function createToolContributions(
    source: string,
    tools: Record<string, ToolDefinition>,
): ToolContribution[] {
    return Object.entries(tools).map(([name, definition]) => ({
        name,
        definition,
        source,
        manifestSpec: {
            description: (definition.tool as { description?: string })
                .description,
            inputSchemaSummary: (definition.tool as { inputSchema?: unknown })
                .inputSchema,
        },
    }))
}
