import type { UIMessage } from 'ai'
import { InvalidContextSegmentError, ToolConflictError } from './errors'
import {
    addSystemSegmentOverhead,
    estimateMessages,
    estimateTextTokens,
    estimateToolSpec,
} from './token-estimator'
import type {
    ChatParams,
    ContextSegment,
    ContextSegmentSnapshot,
    MessageContextSegmentSnapshot,
    PluginOutput,
    SystemContextSegmentSnapshot,
    ToolContribution,
    ToolContributionSnapshot,
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
    'live.runtime': 3,
    'history.recent': 4,
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
    modelMessages: UIMessage[]
    systemSegments: SystemContextSegmentSnapshot[]
    segments: ContextSegmentSnapshot[]
    totalEstimatedTokens: number
} {
    const rawSystemSegments = input.pluginSegments
        .filter((s) => s.target === 'system')
        .slice()
        .sort(sortSegments)

    const messageSegments: MessageContextSegmentSnapshot[] =
        input.pluginSegments
            .filter((s) => s.target === 'messages')
            .slice()
            .sort(sortSegments)
            .map((segment) => {
                if (segment.payload.format !== 'messages') {
                    throw new InvalidContextSegmentError(
                        segment.id,
                        'messages target requires payload.format = "messages"',
                    )
                }

                return {
                    ...segment,
                    target: 'messages' as const,
                    payload: {
                        format: 'messages' as const,
                        messages: segment.payload.messages,
                    },
                }
            })

    const systemSegments: SystemContextSegmentSnapshot[] =
        rawSystemSegments.map((segment, index) => {
            if (segment.payload.format !== 'text') {
                throw new InvalidContextSegmentError(
                    segment.id,
                    'system target requires payload.format = "text"',
                )
            }

            return {
                ...segment,
                target: 'system' as const,
                payload: {
                    format: 'text' as const,
                    text: segment.payload.text,
                },
                included: true as const,
                finalOrder: index,
                estimatedTokens: addSystemSegmentOverhead(
                    estimateTextTokens(segment.payload.text),
                ),
            }
        })

    const systemText = systemSegments
        .map((s) => s.payload.text)
        .filter((t) => t.length > 0)
        .join('\n\n')

    const modelMessages =
        messageSegments.length > 0
            ? messageSegments.flatMap((s) => s.payload.messages)
            : input.rawMessages

    const totalEstimatedTokens =
        systemSegments.reduce((total, s) => total + s.estimatedTokens, 0) +
        estimateMessages(modelMessages)

    return {
        systemText,
        systemSegments,
        segments: [...systemSegments, ...messageSegments],
        modelMessages,
        totalEstimatedTokens,
    }
}

export function assembleTools(tools: ToolContribution[]): {
    aiTools: Record<string, unknown>
    manifestTools: ToolContributionSnapshot[]
    totalEstimatedTokens: number
} {
    const aiTools: Record<string, unknown> = {}
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
        aiTools[tool.name] = tool.definition.tool
    }

    const manifestTools = tools.map((tool) => ({
        ...tool,
        estimatedTokens: estimateToolSpec(tool.manifestSpec),
    }))

    const totalEstimatedTokens = manifestTools.reduce(
        (total, t) => total + t.estimatedTokens,
        0,
    )

    return { aiTools, manifestTools, totalEstimatedTokens }
}

export function assembleParams(
    defaults: ChatParams,
    contributions: Array<{ plugin: string; params: Partial<ChatParams> }>,
): {
    candidates: Array<{
        plugin: string
        key: keyof ChatParams
        value: ChatParams[keyof ChatParams]
    }>
    resolved: Partial<ChatParams>
} {
    const candidates: Array<{
        plugin: string
        key: keyof ChatParams
        value: ChatParams[keyof ChatParams]
    }> = []

    const resolved: Partial<ChatParams> = { ...defaults }

    for (const entry of contributions) {
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
    outputs: Array<{ plugin: string; output: PluginOutput }>
    defaults: ChatParams
}): {
    systemText: string
    systemSegments: SystemContextSegmentSnapshot[]
    segments: ContextSegmentSnapshot[]
    modelMessages: UIMessage[]
    totalEstimatedTokens: number
    aiTools: Record<string, unknown>
    manifestTools: ToolContributionSnapshot[]
    candidates: Array<{
        plugin: string
        key: keyof ChatParams
        value: ChatParams[keyof ChatParams]
    }>
    resolved: Partial<ChatParams>
    totalEstimatedInputTokens: number
} {
    const segments = input.outputs.flatMap((p) => p.output.segments ?? [])
    const tools = input.outputs.flatMap((p) => p.output.tools ?? [])
    const contributions = input.outputs.map((p) => ({
        plugin: p.plugin,
        params: p.output.params ?? {},
    }))

    const segmentsAssembly = assembleSegments({
        rawMessages: input.rawMessages,
        pluginSegments: segments,
    })
    const toolsAssembly = assembleTools(tools)
    const paramsAssembly = assembleParams(input.defaults, contributions)

    return {
        ...segmentsAssembly,
        ...toolsAssembly,
        ...paramsAssembly,
        totalEstimatedInputTokens:
            segmentsAssembly.totalEstimatedTokens +
            toolsAssembly.totalEstimatedTokens,
    }
}
