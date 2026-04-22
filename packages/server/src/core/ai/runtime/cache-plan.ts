import { createHash } from 'node:crypto'
import type {
    AssembledContextSnapshot,
    CachePlanSnapshot,
    ContextSegmentSnapshot,
    ToolContributionSnapshot,
} from './types'

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex')
}

function normalizeValue(value: unknown): unknown {
    if (value === undefined) return undefined
    if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return value
    }

    if (typeof value === 'bigint') {
        return value.toString()
    }

    if (typeof value === 'function') {
        return `[Function:${value.name || 'anonymous'}]`
    }

    if (Array.isArray(value)) {
        return value.map((item) => {
            const normalized = normalizeValue(item)
            return normalized === undefined ? null : normalized
        })
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>
        const result: Record<string, unknown> = {}

        for (const key of Object.keys(record).sort()) {
            const normalized = normalizeValue(record[key])
            if (normalized !== undefined) {
                result[key] = normalized
            }
        }

        return result
    }

    return String(value)
}

function canonicalize(value: unknown): string {
    const normalized = normalizeValue(value)
    if (normalized === undefined) return 'undefined'
    return JSON.stringify(normalized)
}

function classifySegments(segments: ContextSegmentSnapshot[]) {
    const stableCore = segments.filter(
        (segment) =>
            segment.target === 'system' &&
            segment.cacheability === 'stable' &&
            (segment.kind === 'system.base' ||
                segment.kind === 'system.instructions'),
    )

    const cacheableSession = segments.filter(
        (segment) =>
            segment.cacheability === 'session' &&
            (segment.kind === 'memory.long_lived' ||
                segment.target === 'system'),
    )

    const dynamicTail = segments.filter(
        (segment) =>
            !stableCore.some((candidate) => candidate.id === segment.id) &&
            !cacheableSession.some((candidate) => candidate.id === segment.id),
    )

    return { stableCore, cacheableSession, dynamicTail }
}

function classifyDynamicTail(segments: ContextSegmentSnapshot[]) {
    return {
        historyTail: segments.filter((segment) => segment.kind === 'history.recent'),
        liveTail: segments.filter((segment) => segment.kind === 'live.runtime'),
        otherTail: segments.filter(
            (segment) =>
                segment.kind !== 'history.recent' &&
                segment.kind !== 'live.runtime',
        ),
    }
}

function hashTools(tools: ToolContributionSnapshot[]): string {
    return sha256(
        canonicalize(
            tools.map((tool) => ({
                name: tool.name,
                tool: tool.definition.tool,
                description: tool.manifestSpec.description ?? '',
                inputSchemaSummary: tool.manifestSpec.inputSchemaSummary ?? null,
            })),
        ),
    )
}

function toSnakeCase(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z0-9]+)/g, '$1_$2')
        .toLowerCase()
}

function uniquePush(target: string[], value: string): void {
    if (!target.includes(value)) target.push(value)
}

export function buildCachePlan(input: {
    provider: 'anthropic' | 'openai' | 'unknown'
    modelId?: string
    assembledContext: AssembledContextSnapshot
    providerChangeFlags: Record<string, boolean>
    previousPlan?: CachePlanSnapshot
}): CachePlanSnapshot {
    const { stableCore, cacheableSession, dynamicTail } = classifySegments(
        input.assembledContext.segments,
    )
    const { historyTail, liveTail, otherTail } =
        classifyDynamicTail(dynamicTail)
    const effectivePrefix = [...stableCore, ...cacheableSession]
    const breakpoints = [
        ...(stableCore.length > 0
            ? [{ layer: 'stableCore' as const, segmentId: stableCore.at(-1)!.id }]
            : []),
        ...(cacheableSession.length > 0
            ? [
                  {
                      layer: 'cacheableSession' as const,
                      segmentId: cacheableSession.at(-1)!.id,
                  },
              ]
            : []),
    ]

    const hashes = {
        toolDefinitionsHash: hashTools(input.assembledContext.tools),
        systemHash: sha256(
            canonicalize(stableCore.map((segment) => segment.payload)),
        ),
        memoryHash: sha256(
            canonicalize(cacheableSession.map((segment) => segment.payload)),
        ),
        stableCoreHash: sha256(canonicalize(stableCore)),
        effectivePrefixHash: sha256(canonicalize(effectivePrefix)),
        dynamicTailHash: sha256(canonicalize(dynamicTail)),
    }

    const effectivePrefixEstimatedTokens =
        effectivePrefix.reduce(
            (total, segment) => total + (segment.estimatedTokens ?? 0),
            0,
        ) +
        input.assembledContext.tools.reduce(
            (total, tool) => total + tool.estimatedTokens,
            0,
        )

    const candidateInvalidationReasons: string[] = []
    const previous = input.previousPlan

    if (!previous) {
        candidateInvalidationReasons.push('no_previous_baseline')
    } else {
        if (previous.hashes.toolDefinitionsHash !== hashes.toolDefinitionsHash) {
            uniquePush(candidateInvalidationReasons, 'tool_definitions_changed')
        }

        if (previous.hashes.systemHash !== hashes.systemHash) {
            uniquePush(candidateInvalidationReasons, 'system_changed')
        }

        if (previous.hashes.memoryHash !== hashes.memoryHash) {
            uniquePush(candidateInvalidationReasons, 'memory_changed')
        }

        if (previous.hashes.dynamicTailHash !== hashes.dynamicTailHash) {
            if (
                historyTail.length > 0 &&
                liveTail.length === 0 &&
                otherTail.length === 0
            ) {
                uniquePush(candidateInvalidationReasons, 'history_grew')
            } else if (
                liveTail.length > 0 &&
                historyTail.length === 0 &&
                otherTail.length === 0
            ) {
                uniquePush(candidateInvalidationReasons, 'live_context_changed')
            } else {
                uniquePush(candidateInvalidationReasons, 'dynamic_tail_changed')
            }
        }
    }

    for (const [flag, changed] of Object.entries(input.providerChangeFlags)) {
        if (changed) uniquePush(candidateInvalidationReasons, toSnakeCase(flag))
    }

    const providerSupportsPromptCache = input.provider === 'anthropic'
    const prefixAboveThreshold =
        providerSupportsPromptCache && effectivePrefixEstimatedTokens >= 1024
    const cacheExpected = prefixAboveThreshold

    return {
        provider: input.provider,
        stableCoreSegmentIds: stableCore.map((segment) => segment.id),
        cacheableSessionSegmentIds: cacheableSession.map((segment) => segment.id),
        dynamicTailSegmentIds: dynamicTail.map((segment) => segment.id),
        effectivePrefixSegmentIds: effectivePrefix.map((segment) => segment.id),
        effectivePrefixEstimatedTokens,
        breakpoints,
        hashes,
        eligibility: {
            providerSupportsPromptCache,
            prefixAboveThreshold,
            cacheExpected,
            cacheExpectationReason: providerSupportsPromptCache
                ? prefixAboveThreshold
                    ? 'stable_prefix_ready'
                    : 'below_cache_threshold'
                : 'provider_not_supported',
            providerRuleAssumptions: providerSupportsPromptCache
                ? ['anthropic.cacheControl.ephemeral', 'anthropic.minPrefix>=1024']
                : ['provider_not_supported'],
        },
        providerChangeFlags: input.providerChangeFlags,
        candidateInvalidationReasons: [...new Set(candidateInvalidationReasons)],
    }
}
