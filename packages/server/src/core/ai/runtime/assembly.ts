import type { UIMessage } from 'ai'
import { ToolConflictError } from './errors'
import {
    addSystemSegmentOverhead,
    estimateMessages,
    estimateTextTokens,
    estimateToolSpec,
} from './token-estimator'
import type {
    AssembledContextSnapshot,
    AssembledParamsSnapshot,
    ChatParams,
    ContextSegment,
    ModelRequestSnapshot,
    PluginOutputSnapshot,
    ToolContribution,
    ToolDefinition,
} from './types'

const PRIORITY_RANK: Record<ContextSegment['priority'], number> = {
    required: 0,
    high: 1,
    medium: 2,
    low: 3,
}

const KIND_RANK: Record<ContextSegment['kind'], number> = {
    'system.base': 0,
    'system.instructions': 1,
    'memory.long_lived': 2,
    'history.recent': 3,
    'live.runtime': 4,
}

function sortSegments(a: ContextSegment, b: ContextSegment): number {
    const pa = PRIORITY_RANK[a.priority] ?? 999
    const pb = PRIORITY_RANK[b.priority] ?? 999
    if (pa !== pb) return pa - pb

    const ka = KIND_RANK[a.kind] ?? 999
    const kb = KIND_RANK[b.kind] ?? 999
    if (ka !== kb) return ka - kb

    return a.id.localeCompare(b.id)
}

export function assembleSegments(input: {
    rawMessages: UIMessage[]
    pluginSegments: ContextSegment[]
}): {
    systemText: string
    systemSegments: ContextSegment[]
    modelMessages: UIMessage[]
    usedSegments: ContextSegment[]
} {
    const systemSegments = input.pluginSegments
        .filter((s) => s.target === 'system')
        .slice()
        .sort(sortSegments)

    const messageSegments = input.pluginSegments
        .filter((s) => s.target === 'messages')
        .slice()
        .sort(sortSegments)

    const systemText = systemSegments
        .map((s) => (s.payload.format === 'text' ? s.payload.text : ''))
        .filter((t) => t.length > 0)
        .join('\n\n')

    const hasContributedMessages = messageSegments.some(
        (s) => s.payload.format === 'messages',
    )
    const modelMessages = hasContributedMessages
        ? messageSegments.flatMap((s) =>
              s.payload.format === 'messages' ? s.payload.messages : [],
          )
        : input.rawMessages

    const usedSegments = hasContributedMessages
        ? [...systemSegments, ...messageSegments]
        : systemSegments

    return { systemText, systemSegments, modelMessages, usedSegments }
}

export function assembleTools(
    tools: ToolContribution[],
): { toolMap: Record<string, ToolDefinition>; toolNames: string[] } {
    const toolMap: Record<string, ToolDefinition> = {}
    const ownership: Record<string, string> = {}

    for (const tool of tools) {
        if (ownership[tool.name] != null) {
            throw new ToolConflictError(
                tool.name,
                ownership[tool.name],
                tool.source,
            )
        }
        ownership[tool.name] = tool.source
        toolMap[tool.name] = tool.definition
    }

    return { toolMap, toolNames: Object.keys(toolMap) }
}

export function assembleParams(
    defaults: Partial<ChatParams>,
    pluginParams: Array<{ plugin: string; params: Partial<ChatParams> }>,
): AssembledParamsSnapshot {
    const candidates: AssembledParamsSnapshot['candidates'] = []
    const resolved: Partial<ChatParams> = { ...defaults }

    for (const entry of pluginParams) {
        for (const [key, value] of Object.entries(entry.params) as Array<
            [keyof ChatParams, ChatParams[keyof ChatParams]]
        >) {
            if (value === undefined) continue
            candidates.push({ plugin: entry.plugin, key, value })
            resolved[key] = value
        }
    }

    return { candidates, resolved }
}

export function assembleContextRequest(input: {
    rawMessages: UIMessage[]
    pluginOutputs: PluginOutputSnapshot[]
    defaults: Partial<ChatParams>
    providerOptions?: Record<string, unknown>
}): {
    assembledContext: AssembledContextSnapshot
    modelRequest: ModelRequestSnapshot
    toolMap: Record<string, ToolDefinition>
} {
    const segments = input.pluginOutputs.flatMap((p) => p.output.segments ?? [])
    const tools = input.pluginOutputs.flatMap((p) => p.output.tools ?? [])
    const pluginParams = input.pluginOutputs.map((p) => ({
        plugin: p.plugin,
        params: p.output.params ?? {},
    }))

    const segmentAssembly = assembleSegments({
        rawMessages: input.rawMessages,
        pluginSegments: segments,
    })
    const toolAssembly = assembleTools(tools)
    const params = assembleParams(input.defaults, pluginParams)

    const systemTokens = addSystemSegmentOverhead(
        segmentAssembly.systemSegments.reduce((total, s) => {
            if (s.payload.format !== 'text') return total
            return total + estimateTextTokens(s.payload.text)
        }, 0),
    )
    const messageTokens = estimateMessages(segmentAssembly.modelMessages)
    const toolTokens = tools.reduce(
        (total, t) => total + estimateToolSpec(t.manifestSpec),
        0,
    )

    const totalEstimatedInputTokens = systemTokens + messageTokens + toolTokens

    const assembledContext: AssembledContextSnapshot = {
        segments: segmentAssembly.usedSegments,
        tools,
        params,
        totalEstimatedInputTokens,
    }

    const modelRequest: ModelRequestSnapshot = {
        systemText: segmentAssembly.systemText,
        modelMessages: segmentAssembly.modelMessages,
        toolNames: toolAssembly.toolNames,
        resolvedParams: params.resolved,
        providerOptions: input.providerOptions ?? {},
    }

    return { assembledContext, modelRequest, toolMap: toolAssembly.toolMap }
}

