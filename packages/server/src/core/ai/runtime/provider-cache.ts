import type { LanguageModelUsage, ModelMessage, ProviderMetadata } from 'ai'
import type {
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
        ([key]) => key === 'cache_creation_input_tokens' || key === 'cache_read_input_tokens',
    )

    if (cacheUsageEntries.length > 0) {
        result.usage = Object.fromEntries(cacheUsageEntries)
    }

    if (Object.keys(result).length === 0) return undefined

    return {
        anthropic: result,
    }
}

export function buildProviderCacheRequest(input: {
    provider: 'anthropic' | 'openai' | 'unknown'
    cachePlan: CachePlanSnapshot
    systemSegments: SystemContextSegmentSnapshot[]
    modelMessages: ModelMessage[]
    providerOptions: Record<string, unknown>
}): {
    system: string | undefined
    messages: ModelMessage[]
    providerOptions: Record<string, unknown>
} {
    if (
        input.provider !== 'anthropic' ||
        !input.cachePlan.eligibility.cacheExpected
    ) {
        return {
            system: buildCombinedSystemText(input.systemSegments),
            messages: input.modelMessages,
            providerOptions: input.providerOptions,
        }
    }

    const { stableText, sessionText, remainderText } = groupAnthropicSystemLayers(
        input.systemSegments,
        input.cachePlan,
    )

    return {
        system: undefined,
        messages: [
            ...(stableText ? [createAnthropicCacheMessage(stableText)] : []),
            ...(sessionText ? [createAnthropicCacheMessage(sessionText)] : []),
            ...(remainderText ? [createSystemMessage(remainderText)] : []),
            ...input.modelMessages,
        ],
        providerOptions: input.providerOptions,
    }
}

export function normalizeProviderCacheResult(input: {
    cachePlan?: CachePlanSnapshot
    totalUsage?: LanguageModelUsage
    providerMetadata?: ProviderMetadata
    rolloutGateStatus: 'observe-only' | 'enabled' | 'disabled'
    circuitBreakerState: 'closed' | 'open'
    cacheDisabledReason?: string
    missDiagnosis?: string[]
}): CacheResultSnapshot {
    void input.cachePlan

    const cacheReadTokens = input.totalUsage?.inputTokenDetails?.cacheReadTokens
    const cacheWriteTokens =
        input.totalUsage?.inputTokenDetails?.cacheWriteTokens
    const uncachedInputTokens =
        input.totalUsage?.inputTokenDetails?.noCacheTokens
    const totalInput =
        (cacheReadTokens ?? 0) +
        (cacheWriteTokens ?? 0) +
        (uncachedInputTokens ?? 0)

    return {
        cacheObserved: (cacheReadTokens ?? 0) > 0 || (cacheWriteTokens ?? 0) > 0,
        cacheReadTokens,
        cacheWriteTokens,
        uncachedInputTokens,
        cachedTokenRatio:
            totalInput > 0 ? (cacheReadTokens ?? 0) / totalInput : undefined,
        providerRawCacheUsage: pickAnthropicCacheUsage(input.providerMetadata),
        cacheDisabledReason: input.cacheDisabledReason,
        rolloutGateStatus: input.rolloutGateStatus,
        circuitBreakerState: input.circuitBreakerState,
        missDiagnosis: input.missDiagnosis,
    }
}
