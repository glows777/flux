import { describe, expect, test } from 'bun:test'
import {
    attachCachePlanSnapshot,
    attachCacheResultSnapshot,
    createBaseManifest,
} from '../../../../src/core/ai/runtime/context-manifest'

describe('context-manifest cache snapshots', () => {
    test('attaches cachePlan and cacheResult without mutating other manifest sections', () => {
        let manifest = createBaseManifest({
            runId: 'run-cache-1',
            input: {
                messages: [],
                channel: 'web',
                mode: 'conversation',
            },
            defaults: { maxSteps: 20 },
        })

        manifest = attachCachePlanSnapshot(manifest, {
            provider: 'anthropic',
            stableCoreSegmentIds: ['global-base', 'global-instructions'],
            cacheableSessionSegmentIds: ['memory-context'],
            dynamicTailSegmentIds: ['session-history'],
            effectivePrefixSegmentIds: [
                'global-base',
                'global-instructions',
                'memory-context',
            ],
            effectivePrefixEstimatedTokens: 1600,
            breakpoints: [
                { layer: 'stableCore', segmentId: 'global-instructions' },
                { layer: 'cacheableSession', segmentId: 'memory-context' },
            ],
            hashes: {
                toolDefinitionsHash: 'tool-hash',
                systemHash: 'system-hash',
                memoryHash: 'memory-hash',
                stableCoreHash: 'core-hash',
                effectivePrefixHash: 'prefix-hash',
                dynamicTailHash: 'tail-hash',
            },
            eligibility: {
                providerSupportsPromptCache: true,
                prefixAboveThreshold: true,
                cacheExpected: true,
                cacheExpectationReason: 'stable_prefix_ready',
                providerRuleAssumptions: ['anthropic>=1024'],
            },
            providerChangeFlags: {
                modelChanged: false,
                toolChoiceChanged: false,
            },
            candidateInvalidationReasons: [],
        })

        manifest = attachCacheResultSnapshot(manifest, {
            cacheObserved: true,
            cacheReadTokens: 1200,
            cacheWriteTokens: 400,
            uncachedInputTokens: 200,
            cachedTokenRatio: 0.75,
            providerRawCacheUsage: {
                anthropic: {
                    cache_creation_input_tokens: 400,
                    cache_read_input_tokens: 1200,
                },
            },
            rolloutGateStatus: 'enabled',
            circuitBreakerState: 'closed',
        })

        expect(manifest.cachePlan?.provider).toBe('anthropic')
        expect(manifest.cachePlan?.breakpoints).toHaveLength(2)
        expect(manifest.result?.cacheResult?.cacheReadTokens).toBe(1200)
        expect(manifest.result?.cacheResult?.rolloutGateStatus).toBe(
            'enabled',
        )
        expect(manifest.modelRequest.providerOptions).toEqual({})
    })
})
