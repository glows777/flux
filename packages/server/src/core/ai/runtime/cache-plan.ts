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

function hashTools(tools: ToolContributionSnapshot[]): string {
    return sha256(
        canonicalize(
            tools.map((tool) => ({
                name: tool.name,
                tool: tool.definition.tool,
                description: tool.manifestSpec.description ?? '',
                inputSchemaSummary:
                    tool.manifestSpec.inputSchemaSummary ?? null,
            })),
        ),
    )
}

function estimateTools(tools: ToolContributionSnapshot[]): number {
    return tools.reduce((total, tool) => total + (tool.estimatedTokens ?? 0), 0)
}

function estimateSegment(segment: ContextSegmentSnapshot): number {
    return 'estimatedTokens' in segment ? segment.estimatedTokens : 0
}

interface AnthropicMinPrefixRule {
    readonly modelRule: string
    readonly minCacheablePrefixTokens: number
    readonly aliases?: string[]
    readonly matchKind: 'specific' | 'family'
}

const ANTHROPIC_MIN_PREFIX_RULES: AnthropicMinPrefixRule[] = [
    {
        modelRule: 'claude-sonnet-4-6',
        minCacheablePrefixTokens: 2048,
        matchKind: 'specific',
    },
    {
        modelRule: 'claude-opus-4-6',
        minCacheablePrefixTokens: 4096,
        matchKind: 'specific',
    },
    {
        modelRule: 'claude-opus-4-5',
        minCacheablePrefixTokens: 4096,
        matchKind: 'specific',
    },
    {
        modelRule: 'claude-haiku-4-5',
        minCacheablePrefixTokens: 4096,
        matchKind: 'specific',
    },
    {
        modelRule: 'claude-haiku-3-5',
        minCacheablePrefixTokens: 2048,
        matchKind: 'specific',
    },
    {
        modelRule: 'claude-opus-4-1',
        minCacheablePrefixTokens: 1024,
        matchKind: 'specific',
    },
    {
        modelRule: 'claude-sonnet-4-5',
        minCacheablePrefixTokens: 1024,
        matchKind: 'specific',
    },
    {
        modelRule: 'claude-sonnet-3-7',
        aliases: ['claude-3-7-sonnet'],
        minCacheablePrefixTokens: 1024,
        matchKind: 'specific',
    },
    {
        modelRule: 'claude-opus-4',
        minCacheablePrefixTokens: 1024,
        matchKind: 'family',
    },
    {
        modelRule: 'claude-sonnet-4',
        minCacheablePrefixTokens: 1024,
        matchKind: 'family',
    },
    {
        modelRule: 'claude-opus-3',
        aliases: ['claude-3-opus'],
        minCacheablePrefixTokens: 1024,
        matchKind: 'family',
    },
]

function normalizeModelIdForRuleMatch(modelId: string): string {
    const normalized = modelId.trim().toLowerCase().replaceAll('_', '-')
    const claudeIndex = normalized.indexOf('claude-')

    return claudeIndex >= 0 ? normalized.slice(claudeIndex) : normalized
}

function matchesAnthropicPattern(
    modelId: string,
    pattern: string,
    matchKind: AnthropicMinPrefixRule['matchKind'],
): boolean {
    if (modelId === pattern) return true
    if (!modelId.startsWith(`${pattern}-`)) return false

    if (matchKind === 'specific') return true

    const suffix = modelId.slice(pattern.length + 1)
    return /^\d{8}(?:$|-)/.test(suffix) || /^(latest|v\d+)(?:$|-)/.test(suffix)
}

function resolveAnthropicMinPrefixRule(modelId?: string): {
    minCacheablePrefixTokens: number
    modelRule: string
} {
    const normalizedModelId =
        modelId == null ? undefined : normalizeModelIdForRuleMatch(modelId)

    if (normalizedModelId) {
        for (const rule of ANTHROPIC_MIN_PREFIX_RULES) {
            const patterns = [rule.modelRule, ...(rule.aliases ?? [])]
            if (
                patterns.some((pattern) =>
                    matchesAnthropicPattern(
                        normalizedModelId,
                        pattern,
                        rule.matchKind,
                    ),
                )
            ) {
                return {
                    minCacheablePrefixTokens: rule.minCacheablePrefixTokens,
                    modelRule: rule.modelRule,
                }
            }
        }
    }

    return {
        minCacheablePrefixTokens: 4096,
        modelRule: 'unknown_conservative',
    }
}

export function buildCachePlan(input: {
    provider: 'anthropic' | 'openai' | 'unknown'
    modelId?: string
    assembledContext: AssembledContextSnapshot
}): CachePlanSnapshot {
    const { stableCore, cacheableSession, dynamicTail } = classifySegments(
        input.assembledContext.segments,
    )
    const toolDefinitionsHash = hashTools(input.assembledContext.tools)
    const effectivePrefix = [...stableCore, ...cacheableSession]
    const breakpoints: Array<{
        layer: 'stableCore' | 'cacheableSession'
        segmentId: string
    }> = []
    const lastStableCore = stableCore.at(-1)
    if (lastStableCore) {
        breakpoints.push({
            layer: 'stableCore',
            segmentId: lastStableCore.id,
        })
    }
    const lastCacheableSession = cacheableSession.at(-1)
    if (lastCacheableSession) {
        breakpoints.push({
            layer: 'cacheableSession',
            segmentId: lastCacheableSession.id,
        })
    }

    const hashes = {
        toolDefinitionsHash,
        systemHash: sha256(
            canonicalize(stableCore.map((segment) => segment.payload)),
        ),
        memoryHash: sha256(
            canonicalize(cacheableSession.map((segment) => segment.payload)),
        ),
        dynamicTailHash: sha256(canonicalize(dynamicTail)),
    }

    const effectivePrefixEstimatedTokens =
        estimateTools(input.assembledContext.tools) +
        effectivePrefix.reduce(
            (total, segment) => total + estimateSegment(segment),
            0,
        )

    const providerSupportsPromptCache = input.provider === 'anthropic'
    const anthropicMinPrefixRule = providerSupportsPromptCache
        ? resolveAnthropicMinPrefixRule(input.modelId)
        : undefined
    const minCacheablePrefixTokens =
        anthropicMinPrefixRule?.minCacheablePrefixTokens
    const prefixAboveThreshold =
        providerSupportsPromptCache &&
        minCacheablePrefixTokens != null &&
        effectivePrefixEstimatedTokens >= minCacheablePrefixTokens
    const cacheExpected = prefixAboveThreshold

    return {
        provider: input.provider,
        modelId: input.modelId,
        minCacheablePrefixTokens,
        stableCoreSegmentIds: stableCore.map((segment) => segment.id),
        cacheableSessionSegmentIds: cacheableSession.map(
            (segment) => segment.id,
        ),
        dynamicTailSegmentIds: dynamicTail.map((segment) => segment.id),
        effectivePrefixSegmentIds: effectivePrefix.map((segment) => segment.id),
        effectivePrefixEstimatedTokens,
        breakpoints,
        hashes,
        eligibility: {
            providerSupportsPromptCache,
            prefixAboveThreshold,
            minCacheablePrefixTokens,
            cacheExpected,
            cacheExpectationReason: providerSupportsPromptCache
                ? prefixAboveThreshold
                    ? 'stable_prefix_ready'
                    : 'below_cache_threshold'
                : 'provider_not_supported',
            providerRuleAssumptions: providerSupportsPromptCache
                ? [
                      'anthropic.cacheControl.ephemeral',
                      `anthropic.minPrefix>=${minCacheablePrefixTokens}`,
                      `anthropic.modelRule=${anthropicMinPrefixRule?.modelRule}`,
                  ]
                : ['provider_not_supported'],
        },
    }
}
