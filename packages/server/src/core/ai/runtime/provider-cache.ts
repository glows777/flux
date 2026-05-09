import type { LanguageModelUsage, ModelMessage, ProviderMetadata } from 'ai'
import type {
    CacheEvidenceSource,
    CachePlanSnapshot,
    CacheResultSnapshot,
    SystemContextSegmentSnapshot,
} from './types'

function buildCombinedSystemText(
    systemSegments: SystemContextSegmentSnapshot[],
): string | undefined {
    const text = systemSegments
        .map((segment) => segment.payload.text)
        .filter(Boolean)
        .join('\n\n')

    return text || undefined
}

function groupAnthropicSystemLayers(
    systemSegments: SystemContextSegmentSnapshot[],
    cachePlan: CachePlanSnapshot,
): { stableText?: string; sessionText?: string; remainderText?: string } {
    const stableIds = new Set(cachePlan.stableCoreSegmentIds)
    const sessionIds = new Set(cachePlan.cacheableSessionSegmentIds)

    const stableText = systemSegments
        .filter((segment) => stableIds.has(segment.id))
        .map((segment) => segment.payload.text)
        .filter(Boolean)
        .join('\n\n')

    const sessionText = systemSegments
        .filter((segment) => sessionIds.has(segment.id))
        .map((segment) => segment.payload.text)
        .filter(Boolean)
        .join('\n\n')

    const remainderText = systemSegments
        .filter(
            (segment) =>
                !stableIds.has(segment.id) && !sessionIds.has(segment.id),
        )
        .map((segment) => segment.payload.text)
        .filter(Boolean)
        .join('\n\n')

    return {
        stableText: stableText || undefined,
        sessionText: sessionText || undefined,
        remainderText: remainderText || undefined,
    }
}

function createAnthropicCacheMessage(content: string): ModelMessage {
    return {
        role: 'system',
        content,
        providerOptions: {
            anthropic: {
                cacheControl: { type: 'ephemeral' },
            },
        },
    } as ModelMessage
}

function createSystemMessage(content: string): ModelMessage {
    return {
        role: 'system',
        content,
    } as ModelMessage
}

function mergeAnthropicCacheControl(
    providerOptions: unknown,
): Record<string, unknown> {
    const base =
        providerOptions != null &&
        typeof providerOptions === 'object' &&
        !Array.isArray(providerOptions)
            ? { ...(providerOptions as Record<string, unknown>) }
            : {}

    const anthropic =
        base.anthropic != null &&
        typeof base.anthropic === 'object' &&
        !Array.isArray(base.anthropic)
            ? { ...(base.anthropic as Record<string, unknown>) }
            : {}

    anthropic.cacheControl = { type: 'ephemeral' }
    base.anthropic = anthropic
    return base
}

function shapeAnthropicCachedTools(
    tools: Record<string, unknown>,
): Record<string, unknown> {
    const toolEntries = Object.entries(tools)
    if (toolEntries.length === 0) return tools

    const lastToolIndex = toolEntries.findLastIndex(([, tool]) => {
        if (tool == null || typeof tool !== 'object' || Array.isArray(tool)) {
            return false
        }

        const type = (tool as { type?: unknown }).type
        return type == null || type === 'function' || type === 'dynamic'
    })

    if (lastToolIndex === -1) return tools

    return Object.fromEntries(
        toolEntries.map(([name, tool], index) => {
            if (index !== lastToolIndex) return [name, tool]
            if (
                tool == null ||
                typeof tool !== 'object' ||
                Array.isArray(tool)
            ) {
                return [name, tool]
            }

            return [
                name,
                {
                    ...(tool as Record<string, unknown>),
                    providerOptions: mergeAnthropicCacheControl(
                        (tool as { providerOptions?: unknown }).providerOptions,
                    ),
                },
            ]
        }),
    )
}

function pickAnthropicCacheUsage(
    providerMetadata?: ProviderMetadata,
): Record<string, unknown> | undefined {
    const anthropicMetadata = providerMetadata?.anthropic
    if (
        anthropicMetadata == null ||
        typeof anthropicMetadata !== 'object' ||
        Array.isArray(anthropicMetadata)
    ) {
        return undefined
    }

    const result: Record<string, unknown> = {}

    if ('cacheCreationInputTokens' in anthropicMetadata) {
        const cacheCreationInputTokens =
            anthropicMetadata.cacheCreationInputTokens
        if (cacheCreationInputTokens != null) {
            result.cacheCreationInputTokens = cacheCreationInputTokens
        }
    }

    const usage =
        'usage' in anthropicMetadata &&
        anthropicMetadata.usage != null &&
        typeof anthropicMetadata.usage === 'object' &&
        !Array.isArray(anthropicMetadata.usage)
            ? (anthropicMetadata.usage as Record<string, unknown>)
            : undefined

    const cacheUsageEntries = Object.entries(usage ?? {}).filter(
        ([key]) =>
            key === 'cache_creation_input_tokens' ||
            key === 'cache_read_input_tokens',
    )

    if (cacheUsageEntries.length > 0) {
        result.usage = Object.fromEntries(cacheUsageEntries)
    }

    if (Object.keys(result).length === 0) return undefined

    return {
        anthropic: result,
    }
}

function toPositiveNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : undefined
}

function toNonNegativeNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : undefined
}

function getInputTokenDetails(
    totalUsage?: LanguageModelUsage,
): Record<string, unknown> | undefined {
    const details = totalUsage?.inputTokenDetails
    return details != null && typeof details === 'object'
        ? (details as Record<string, unknown>)
        : undefined
}

function getAnthropicProviderCacheUsage(
    providerRawCacheUsage?: Record<string, unknown>,
):
    | { record: Record<string, unknown>; usage?: Record<string, unknown> }
    | undefined {
    const anthropic = providerRawCacheUsage?.anthropic
    if (
        anthropic == null ||
        typeof anthropic !== 'object' ||
        Array.isArray(anthropic)
    ) {
        return undefined
    }

    const record = anthropic as Record<string, unknown>
    const usage = record.usage
    if (usage == null || typeof usage !== 'object' || Array.isArray(usage)) {
        return { record }
    }

    return { record, usage: usage as Record<string, unknown> }
}

function resolveCacheEvidenceSource(params: {
    totalUsagePositive: boolean
    providerMetadataPositive: boolean
}): CacheEvidenceSource {
    if (params.totalUsagePositive && params.providerMetadataPositive) {
        return 'both'
    }
    if (params.totalUsagePositive) return 'totalUsage'
    if (params.providerMetadataPositive) return 'providerMetadata'
    return 'none'
}

function collectDirectionalCacheEvidence(params: {
    totalUsage?: LanguageModelUsage
    providerRawCacheUsage?: Record<string, unknown>
}): {
    readSource: CacheEvidenceSource
    writeSource: CacheEvidenceSource
} {
    const details = getInputTokenDetails(params.totalUsage)
    const totalUsageReadPositive =
        toPositiveNumber(details?.cacheReadTokens) != null
    const totalUsageWritePositive =
        toPositiveNumber(details?.cacheWriteTokens) != null

    const providerUsage = getAnthropicProviderCacheUsage(
        params.providerRawCacheUsage,
    )
    const providerMetadataReadPositive =
        toPositiveNumber(providerUsage?.usage?.cache_read_input_tokens) != null
    const providerMetadataWritePositive =
        toPositiveNumber(providerUsage?.record.cacheCreationInputTokens) !=
            null ||
        toPositiveNumber(providerUsage?.usage?.cache_creation_input_tokens) !=
            null

    return {
        readSource: resolveCacheEvidenceSource({
            totalUsagePositive: totalUsageReadPositive,
            providerMetadataPositive: providerMetadataReadPositive,
        }),
        writeSource: resolveCacheEvidenceSource({
            totalUsagePositive: totalUsageWritePositive,
            providerMetadataPositive: providerMetadataWritePositive,
        }),
    }
}

export function buildProviderCacheRequest(input: {
    provider: 'anthropic' | 'openai' | 'unknown'
    cachePlan: CachePlanSnapshot
    systemSegments: SystemContextSegmentSnapshot[]
    modelMessages: ModelMessage[]
    providerOptions: Record<string, unknown>
    tools: Record<string, unknown>
}): {
    system: string | undefined
    messages: ModelMessage[]
    providerOptions: Record<string, unknown>
    tools: Record<string, unknown>
} {
    if (
        input.provider !== 'anthropic' ||
        !input.cachePlan.eligibility.cacheExpected
    ) {
        return {
            system: buildCombinedSystemText(input.systemSegments),
            messages: input.modelMessages,
            providerOptions: input.providerOptions,
            tools: input.tools,
        }
    }

    const { stableText, sessionText, remainderText } =
        groupAnthropicSystemLayers(input.systemSegments, input.cachePlan)

    return {
        system: undefined,
        messages: [
            ...(stableText ? [createAnthropicCacheMessage(stableText)] : []),
            ...(sessionText ? [createAnthropicCacheMessage(sessionText)] : []),
            ...(remainderText ? [createSystemMessage(remainderText)] : []),
            ...input.modelMessages,
        ],
        providerOptions: input.providerOptions,
        tools: shapeAnthropicCachedTools(input.tools),
    }
}

export function normalizeProviderCacheResult(input: {
    cachePlan?: CachePlanSnapshot
    totalUsage?: LanguageModelUsage
    providerMetadata?: ProviderMetadata
    rolloutGateStatus: 'observe-only' | 'enabled' | 'disabled'
    circuitBreakerState: 'closed' | 'open'
    cacheDisabledReason?: string
}): CacheResultSnapshot {
    void input.cachePlan

    const details = getInputTokenDetails(input.totalUsage)
    const cacheReadTokens = toNonNegativeNumber(details?.cacheReadTokens)
    const cacheWriteTokens = toNonNegativeNumber(details?.cacheWriteTokens)
    const uncachedInputTokens = toNonNegativeNumber(details?.noCacheTokens)
    const totalInput =
        (cacheReadTokens ?? 0) +
        (cacheWriteTokens ?? 0) +
        (uncachedInputTokens ?? 0)
    const providerRawCacheUsage = pickAnthropicCacheUsage(
        input.providerMetadata,
    )
    const { readSource, writeSource } = collectDirectionalCacheEvidence({
        totalUsage: input.totalUsage,
        providerRawCacheUsage,
    })
    const totalUsagePositive =
        readSource === 'totalUsage' ||
        readSource === 'both' ||
        writeSource === 'totalUsage' ||
        writeSource === 'both'
    const providerMetadataPositive =
        readSource === 'providerMetadata' ||
        readSource === 'both' ||
        writeSource === 'providerMetadata' ||
        writeSource === 'both'
    const evidenceSource = resolveCacheEvidenceSource({
        totalUsagePositive,
        providerMetadataPositive,
    })

    return {
        cacheObserved: evidenceSource !== 'none',
        evidenceSource,
        cacheReadObserved: readSource !== 'none',
        cacheWriteObserved: writeSource !== 'none',
        cacheReadEvidenceSource: readSource,
        cacheWriteEvidenceSource: writeSource,
        cacheReadTokens,
        cacheWriteTokens,
        uncachedInputTokens,
        cachedTokenRatio:
            totalInput > 0 ? (cacheReadTokens ?? 0) / totalInput : undefined,
        providerRawCacheUsage,
        cacheDisabledReason: input.cacheDisabledReason,
        rolloutGateStatus: input.rolloutGateStatus,
        circuitBreakerState: input.circuitBreakerState,
    }
}
