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
): { stableText?: string; sessionText?: string } {
    const stableText = systemSegments
        .filter((segment) => cachePlan.stableCoreSegmentIds.includes(segment.id))
        .map((segment) => segment.payload.text)
        .filter(Boolean)
        .join('\n\n')

    const sessionText = systemSegments
        .filter((segment) =>
            cachePlan.cacheableSessionSegmentIds.includes(segment.id),
        )
        .map((segment) => segment.payload.text)
        .filter(Boolean)
        .join('\n\n')

    return {
        stableText: stableText || undefined,
        sessionText: sessionText || undefined,
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

    const { stableText, sessionText } = groupAnthropicSystemLayers(
        input.systemSegments,
        input.cachePlan,
    )

    return {
        system: undefined,
        messages: [
            ...(stableText ? [createAnthropicCacheMessage(stableText)] : []),
            ...(sessionText ? [createAnthropicCacheMessage(sessionText)] : []),
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
        providerRawCacheUsage:
            input.providerMetadata &&
            Object.keys(input.providerMetadata).length > 0
                ? (input.providerMetadata as Record<string, unknown>)
                : undefined,
        cacheDisabledReason: input.cacheDisabledReason,
        rolloutGateStatus: input.rolloutGateStatus,
        circuitBreakerState: input.circuitBreakerState,
        missDiagnosis: input.missDiagnosis,
    }
}
