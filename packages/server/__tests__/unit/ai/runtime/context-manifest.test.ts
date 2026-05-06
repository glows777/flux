import { describe, expect, test } from 'bun:test'
import {
    attachCachePlanSnapshot,
    attachCacheResultSnapshot,
    createBaseManifest,
} from '../../../../src/core/ai/runtime/context-manifest'

describe('context-manifest cache snapshots', () => {
    test('does not invent a result when cacheResult is attached before finalization', () => {
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
        })

        manifest = attachCacheResultSnapshot(manifest, {
            cacheObserved: true,
            evidenceSource: 'both',
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
        expect(manifest.result).toBeUndefined()
        expect(manifest.modelRequest.providerOptions).toEqual({})
    })

    test('preserves an existing real result when cacheResult is attached', () => {
        const manifest = createBaseManifest({
            runId: 'run-cache-2',
            input: {
                messages: [],
                channel: 'web',
                mode: 'conversation',
            },
            defaults: { maxSteps: 20 },
        })

        const withResult = {
            ...manifest,
            result: {
                text: 'final text',
                responseMessage: { id: 'msg-1', role: 'assistant', parts: [] },
                toolCalls: [],
                usage: { inputTokens: 10, outputTokens: 3 },
            },
        }

        const updated = attachCacheResultSnapshot(withResult, {
            cacheObserved: true,
            evidenceSource: 'totalUsage',
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

        expect(updated.result).toEqual({
            text: 'final text',
            responseMessage: { id: 'msg-1', role: 'assistant', parts: [] },
            toolCalls: [],
            usage: { inputTokens: 10, outputTokens: 3 },
            cacheResult: {
                cacheObserved: true,
                evidenceSource: 'totalUsage',
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
            },
        })
    })
})
