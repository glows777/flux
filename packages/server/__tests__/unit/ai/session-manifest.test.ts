import { describe, expect, it, mock } from 'bun:test'

if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
        'postgresql://test:test@localhost:5433/flux_test?schema=public'
}

import type { SessionDeps } from '@/core/ai/session'

function createManifest({ runId = 'run-1' }: { runId?: string } = {}) {
    return {
        runId,
        createdAt: '2024-06-01T00:00:00.000Z',
        input: {
            channel: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            rawMessages: [],
            initialSessionId: 'session-1',
            resolvedSessionId: 'session-1',
            defaults: {},
        },
        pluginOutputs: [],
        assembledContext: {
            segments: [],
            systemSegments: [],
            tools: [],
            params: { candidates: [], resolved: {} },
            totalEstimatedInputTokens: 0,
        },
        modelRequest: {
            systemText: '',
            modelMessages: [],
            toolNames: [],
            resolvedParams: {},
            providerOptions: {},
        },
        cachePlan: {
            provider: 'anthropic',
            stableCoreSegmentIds: [],
            cacheableSessionSegmentIds: [],
            dynamicTailSegmentIds: [],
            effectivePrefixSegmentIds: [],
            effectivePrefixEstimatedTokens: 0,
            breakpoints: [],
            hashes: {
                toolDefinitionsHash: 'tool-hash',
                systemHash: 'system-hash',
                memoryHash: 'memory-hash',
                dynamicTailHash: 'tail-hash',
            },
            eligibility: {
                providerSupportsPromptCache: true,
                prefixAboveThreshold: false,
                cacheExpected: false,
                cacheExpectationReason: 'below_cache_threshold',
                providerRuleAssumptions: ['anthropic>=1024'],
            },
        },
        result: {
            text: '',
            responseMessage: { id: 'a1', role: 'assistant', parts: [] },
            toolCalls: [],
            usage: { inputTokens: 0, outputTokens: 0 },
            cacheResult: {
                cacheObserved: false,
                evidenceSource: 'none',
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                uncachedInputTokens: 0,
                cachedTokenRatio: 0,
                providerRawCacheUsage: undefined,
                rolloutGateStatus: 'observe-only',
                circuitBreakerState: 'closed',
            },
        },
    }
}

function createMockDb() {
    return {
        chatMessageManifest: {
            upsert: mock(() => Promise.resolve({})),
            findFirst: mock(() => Promise.resolve(null)),
            findUnique: mock(() => Promise.resolve(null)),
        },
    }
}

async function importActualSessionModule() {
    const moduleUrl = new URL(
        `../../../src/core/ai/session-manifest.ts?real=${Date.now()}-${Math.random()}`,
        import.meta.url,
    )

    return import(moduleUrl.href)
}

async function importActualSessionErrors() {
    const moduleUrl = new URL(
        `../../../src/core/ai/session-errors.ts?real=${Date.now()}-${Math.random()}`,
        import.meta.url,
    )

    return import(moduleUrl.href)
}

describe('saveMessageManifest', () => {
    it('upserts serialized row keyed by run id', async () => {
        const { saveMessageManifest } = await importActualSessionModule()
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps
        const manifest = createManifest({ runId: 'run-1' })

        await saveMessageManifest(
            'session-1',
            'message-1',
            manifest as never,
            deps,
        )

        expect(db.chatMessageManifest.upsert).toHaveBeenCalledTimes(1)
        expect(db.chatMessageManifest.upsert).toHaveBeenCalledWith({
            where: { runId: 'run-1' },
            create: {
                sessionId: 'session-1',
                messageId: 'message-1',
                runId: 'run-1',
                manifest: JSON.stringify(manifest),
                version: 1,
            },
            update: {
                sessionId: 'session-1',
                messageId: 'message-1',
                manifest: JSON.stringify(manifest),
                version: 1,
            },
        })
    })

    it('keeps separate rows for two runs on the same session message', async () => {
        const { saveMessageManifest } = await importActualSessionModule()
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps
        const firstManifest = createManifest({ runId: 'run-1' })
        const secondManifest = createManifest({ runId: 'run-2' })

        await saveMessageManifest(
            'session-1',
            'message-1',
            firstManifest as never,
            deps,
        )
        await saveMessageManifest(
            'session-1',
            'message-1',
            secondManifest as never,
            deps,
        )

        expect(db.chatMessageManifest.upsert).toHaveBeenCalledTimes(2)
        expect(db.chatMessageManifest.upsert.mock.calls[0]?.[0].where).toEqual({
            runId: 'run-1',
        })
        expect(db.chatMessageManifest.upsert.mock.calls[1]?.[0].where).toEqual({
            runId: 'run-2',
        })
    })
})

describe('loadMessageManifest', () => {
    it('returns null when absent', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const db = createMockDb()

        const result = await loadMessageManifest('session-1', 'message-1', {
            db,
        } as unknown as SessionDeps)

        expect(result).toBeNull()
        expect(db.chatMessageManifest.findFirst).toHaveBeenCalledWith({
            where: { sessionId: 'session-1', messageId: 'message-1' },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            select: {
                version: true,
                runId: true,
                manifest: true,
            },
        })
    })

    it('parses and returns the stored payload', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const db = createMockDb()
        const manifest = {
            runId: 'run-2',
            createdAt: '2024-06-02T00:00:00.000Z',
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                initialSessionId: 'session-1',
                resolvedSessionId: 'session-1',
                defaults: {},
            },
            pluginOutputs: [],
            assembledContext: {
                segments: [],
                systemSegments: [],
                tools: [],
                params: { candidates: [], resolved: {} },
                totalEstimatedInputTokens: 0,
            },
            modelRequest: {
                systemText: '',
                modelMessages: [],
                toolNames: [],
                resolvedParams: {},
                providerOptions: {},
            },
            cachePlan: {
                provider: 'anthropic',
                stableCoreSegmentIds: [],
                cacheableSessionSegmentIds: [],
                dynamicTailSegmentIds: [],
                effectivePrefixSegmentIds: [],
                effectivePrefixEstimatedTokens: 0,
                breakpoints: [],
                hashes: {
                    toolDefinitionsHash: 'tool-hash',
                    systemHash: 'system-hash',
                    memoryHash: 'memory-hash',
                    dynamicTailHash: 'tail-hash',
                },
                eligibility: {
                    providerSupportsPromptCache: true,
                    prefixAboveThreshold: false,
                    cacheExpected: false,
                    cacheExpectationReason: 'below_cache_threshold',
                    providerRuleAssumptions: ['anthropic>=1024'],
                },
            },
            result: {
                text: '',
                responseMessage: { id: 'a1', role: 'assistant', parts: [] },
                toolCalls: [],
                usage: { inputTokens: 0, outputTokens: 0 },
                cacheResult: {
                    cacheObserved: false,
                    evidenceSource: 'none',
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    uncachedInputTokens: 0,
                    cachedTokenRatio: 0,
                    providerRawCacheUsage: undefined,
                    rolloutGateStatus: 'observe-only',
                    circuitBreakerState: 'closed',
                },
            },
        }

        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: 'run-2',
                manifest: JSON.stringify(manifest),
            }),
        ) as typeof db.chatMessageManifest.findFirst

        const result = await loadMessageManifest('session-1', 'message-1', {
            db,
        } as unknown as SessionDeps)

        expect(result).toEqual({
            version: 1,
            runId: 'run-2',
            manifest,
        })
    })

    it('loads and parses a stored payload by run id', async () => {
        const { loadMessageManifestByRunId } = await importActualSessionModule()
        const db = createMockDb()
        const manifest = createManifest({ runId: 'run-2' })

        db.chatMessageManifest.findUnique = mock(() =>
            Promise.resolve({
                version: 1,
                runId: 'run-2',
                manifest: JSON.stringify(manifest),
            }),
        ) as typeof db.chatMessageManifest.findUnique

        const result = await loadMessageManifestByRunId('run-2', {
            db,
        } as unknown as SessionDeps)

        expect(db.chatMessageManifest.findUnique).toHaveBeenCalledWith({
            where: { runId: 'run-2' },
            select: {
                version: true,
                runId: true,
                manifest: true,
            },
        })
        expect(result).toEqual({
            version: 1,
            runId: 'run-2',
            manifest,
        })
    })

    it('loads manifests with model-aware plan fields and directional cache evidence', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps
        const manifest = {
            runId: 'run-directional-cache',
            createdAt: '2024-06-04T00:00:00.000Z',
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                defaults: {},
            },
            pluginOutputs: [],
            assembledContext: {
                segments: [],
                systemSegments: [],
                tools: [],
                params: { candidates: [], resolved: {} },
                totalEstimatedInputTokens: 0,
            },
            modelRequest: {
                systemText: '',
                modelMessages: [],
                toolNames: [],
                resolvedParams: {},
                providerOptions: {},
            },
            cachePlan: {
                provider: 'anthropic',
                modelId: 'claude-sonnet-4-6',
                minCacheablePrefixTokens: 2048,
                stableCoreSegmentIds: [],
                cacheableSessionSegmentIds: [],
                dynamicTailSegmentIds: [],
                effectivePrefixSegmentIds: [],
                effectivePrefixEstimatedTokens: 0,
                breakpoints: [],
                hashes: {
                    toolDefinitionsHash: 'tool-hash',
                    systemHash: 'system-hash',
                    memoryHash: 'memory-hash',
                    dynamicTailHash: 'tail-hash',
                },
                eligibility: {
                    providerSupportsPromptCache: true,
                    prefixAboveThreshold: false,
                    minCacheablePrefixTokens: 2048,
                    cacheExpected: false,
                    cacheExpectationReason: 'below_cache_threshold',
                    providerRuleAssumptions: [
                        'anthropic.cacheControl.ephemeral',
                        'anthropic.minPrefix>=2048',
                    ],
                },
            },
            result: {
                text: '',
                responseMessage: { id: 'a1', role: 'assistant', parts: [] },
                toolCalls: [],
                usage: { inputTokens: 0, outputTokens: 0 },
                cacheResult: {
                    cacheObserved: true,
                    evidenceSource: 'both',
                    cacheReadObserved: true,
                    cacheWriteObserved: true,
                    cacheReadEvidenceSource: 'providerMetadata',
                    cacheWriteEvidenceSource: 'both',
                    rolloutGateStatus: 'enabled',
                    circuitBreakerState: 'closed',
                },
            },
        }

        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: manifest.runId,
                manifest: JSON.stringify(manifest),
            }),
        ) as typeof db.chatMessageManifest.findFirst

        const result = await loadMessageManifest('session-1', 'message-1', deps)

        expect(result?.manifest.cachePlan?.modelId).toBe('claude-sonnet-4-6')
        expect(result?.manifest.cachePlan?.minCacheablePrefixTokens).toBe(2048)
        expect(
            result?.manifest.cachePlan?.eligibility.minCacheablePrefixTokens,
        ).toBe(2048)
        expect(result?.manifest.result?.cacheResult?.cacheReadObserved).toBe(
            true,
        )
        expect(result?.manifest.result?.cacheResult?.cacheWriteObserved).toBe(
            true,
        )
    })

    it('loads historical cache plans with providerChangeFlags', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps
        const manifest = {
            runId: 'run-legacy-provider-flags',
            createdAt: '2024-06-04T00:00:00.000Z',
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                defaults: {},
            },
            pluginOutputs: [],
            assembledContext: {
                segments: [],
                systemSegments: [],
                tools: [],
                params: { candidates: [], resolved: {} },
                totalEstimatedInputTokens: 0,
            },
            modelRequest: {
                systemText: '',
                modelMessages: [],
                toolNames: [],
                resolvedParams: {},
                providerOptions: {},
            },
            cachePlan: {
                provider: 'anthropic',
                stableCoreSegmentIds: [],
                cacheableSessionSegmentIds: [],
                dynamicTailSegmentIds: [],
                effectivePrefixSegmentIds: [],
                effectivePrefixEstimatedTokens: 0,
                breakpoints: [],
                hashes: {
                    toolDefinitionsHash: 'tool-hash',
                    systemHash: 'system-hash',
                    memoryHash: 'memory-hash',
                    dynamicTailHash: 'tail-hash',
                },
                eligibility: {
                    providerSupportsPromptCache: true,
                    prefixAboveThreshold: false,
                    cacheExpected: false,
                    cacheExpectationReason: 'below_cache_threshold',
                    providerRuleAssumptions: ['anthropic>=1024'],
                },
                providerChangeFlags: {
                    thinkingConfigChanged: true,
                },
            },
        }

        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: manifest.runId,
                manifest: JSON.stringify(manifest),
            }),
        ) as typeof db.chatMessageManifest.findFirst

        const result = await loadMessageManifest('session-1', 'message-1', deps)

        expect(result?.manifest.cachePlan?.provider).toBe('anthropic')
    })

    it('loads legacy cache results without evidenceSource', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps
        const manifest = {
            runId: 'run-legacy-cache',
            createdAt: '2024-06-04T00:00:00.000Z',
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                defaults: {},
            },
            pluginOutputs: [],
            assembledContext: {
                segments: [],
                systemSegments: [],
                tools: [],
                params: { candidates: [], resolved: {} },
                totalEstimatedInputTokens: 0,
            },
            modelRequest: {
                systemText: '',
                modelMessages: [],
                toolNames: [],
                resolvedParams: {},
                providerOptions: {},
            },
            result: {
                text: '',
                responseMessage: { id: 'a1', role: 'assistant', parts: [] },
                toolCalls: [],
                usage: { inputTokens: 0, outputTokens: 0 },
                cacheResult: {
                    cacheObserved: false,
                    rolloutGateStatus: 'observe-only',
                    circuitBreakerState: 'closed',
                },
            },
        }

        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: manifest.runId,
                manifest: JSON.stringify(manifest),
            }),
        ) as typeof db.chatMessageManifest.findFirst

        const result = await loadMessageManifest('session-1', 'message-1', deps)

        expect(result?.manifest.result?.cacheResult?.cacheObserved).toBe(false)
    })

    it('rejects cache results with invalid evidenceSource', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const { SessionError } = await importActualSessionErrors()
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps
        const manifest = {
            runId: 'run-invalid-evidence-source',
            createdAt: '2024-06-04T00:00:00.000Z',
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                defaults: {},
            },
            pluginOutputs: [],
            assembledContext: {
                segments: [],
                systemSegments: [],
                tools: [],
                params: { candidates: [], resolved: {} },
                totalEstimatedInputTokens: 0,
            },
            modelRequest: {
                systemText: '',
                modelMessages: [],
                toolNames: [],
                resolvedParams: {},
                providerOptions: {},
            },
            result: {
                text: '',
                responseMessage: { id: 'a1', role: 'assistant', parts: [] },
                toolCalls: [],
                usage: { inputTokens: 0, outputTokens: 0 },
                cacheResult: {
                    cacheObserved: false,
                    evidenceSource: 'localGuess',
                    rolloutGateStatus: 'observe-only',
                    circuitBreakerState: 'closed',
                },
            },
        }

        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: manifest.runId,
                manifest: JSON.stringify(manifest),
            }),
        ) as typeof db.chatMessageManifest.findFirst

        try {
            await loadMessageManifest('session-1', 'message-1', deps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })

    it('rejects cache results with malformed directional evidence fields', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const { SessionError } = await importActualSessionErrors()
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps
        const manifest = {
            runId: 'run-invalid-directional-evidence',
            createdAt: '2024-06-04T00:00:00.000Z',
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                defaults: {},
            },
            pluginOutputs: [],
            assembledContext: {
                segments: [],
                systemSegments: [],
                tools: [],
                params: { candidates: [], resolved: {} },
                totalEstimatedInputTokens: 0,
            },
            modelRequest: {
                systemText: '',
                modelMessages: [],
                toolNames: [],
                resolvedParams: {},
                providerOptions: {},
            },
            result: {
                text: '',
                responseMessage: { id: 'a1', role: 'assistant', parts: [] },
                toolCalls: [],
                usage: { inputTokens: 0, outputTokens: 0 },
                cacheResult: {
                    cacheObserved: true,
                    evidenceSource: 'providerMetadata',
                    cacheReadObserved: 'yes',
                    cacheWriteObserved: false,
                    cacheReadEvidenceSource: 'providerMetadata',
                    cacheWriteEvidenceSource: 'none',
                    rolloutGateStatus: 'enabled',
                    circuitBreakerState: 'closed',
                },
            },
        }

        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: manifest.runId,
                manifest: JSON.stringify(manifest),
            }),
        ) as typeof db.chatMessageManifest.findFirst

        try {
            await loadMessageManifest('session-1', 'message-1', deps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })

    it('rejects cache plans with malformed model-aware threshold fields', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const { SessionError } = await importActualSessionErrors()
        const db = createMockDb()
        const deps = { db } as unknown as SessionDeps
        const manifest = {
            runId: 'run-invalid-cache-plan-threshold',
            createdAt: '2024-06-04T00:00:00.000Z',
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                defaults: {},
            },
            pluginOutputs: [],
            assembledContext: {
                segments: [],
                systemSegments: [],
                tools: [],
                params: { candidates: [], resolved: {} },
                totalEstimatedInputTokens: 0,
            },
            modelRequest: {
                systemText: '',
                modelMessages: [],
                toolNames: [],
                resolvedParams: {},
                providerOptions: {},
            },
            cachePlan: {
                provider: 'anthropic',
                modelId: 'claude-sonnet-4-6',
                minCacheablePrefixTokens: '2048',
                stableCoreSegmentIds: [],
                cacheableSessionSegmentIds: [],
                dynamicTailSegmentIds: [],
                effectivePrefixSegmentIds: [],
                effectivePrefixEstimatedTokens: 0,
                breakpoints: [],
                hashes: {
                    toolDefinitionsHash: 'tool-hash',
                    systemHash: 'system-hash',
                    memoryHash: 'memory-hash',
                    dynamicTailHash: 'tail-hash',
                },
                eligibility: {
                    providerSupportsPromptCache: true,
                    prefixAboveThreshold: false,
                    minCacheablePrefixTokens: 2048,
                    cacheExpected: false,
                    cacheExpectationReason: 'below_cache_threshold',
                    providerRuleAssumptions: ['anthropic.minPrefix>=2048'],
                },
            },
        }

        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: manifest.runId,
                manifest: JSON.stringify(manifest),
            }),
        ) as typeof db.chatMessageManifest.findFirst

        try {
            await loadMessageManifest('session-1', 'message-1', deps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })

    it('throws INVALID_INPUT when manifest JSON is malformed', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const { SessionError } = await importActualSessionErrors()
        const db = createMockDb()
        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: 'run-3',
                manifest: '{not-valid-json',
            }),
        ) as typeof db.chatMessageManifest.findFirst

        try {
            await loadMessageManifest('session-1', 'message-1', {
                db,
            } as unknown as SessionDeps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })

    it('throws INVALID_INPUT when manifest JSON has an invalid shape', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const { SessionError } = await importActualSessionErrors()
        const db = createMockDb()
        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: 'run-4',
                manifest: '{}',
            }),
        ) as typeof db.chatMessageManifest.findFirst

        try {
            await loadMessageManifest('session-1', 'message-1', {
                db,
            } as unknown as SessionDeps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })

    it('throws INVALID_INPUT when nested manifest sections are incomplete', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const { SessionError } = await importActualSessionErrors()
        const db = createMockDb()
        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: 'run-5',
                manifest: JSON.stringify({
                    runId: 'run-5',
                    createdAt: '2024-06-03T00:00:00.000Z',
                    input: {
                        channel: 'web',
                    },
                    pluginOutputs: [],
                    assembledContext: {
                        segments: [],
                    },
                    modelRequest: {},
                }),
            }),
        ) as typeof db.chatMessageManifest.findFirst

        try {
            await loadMessageManifest('session-1', 'message-1', {
                db,
            } as unknown as SessionDeps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })

    it('throws INVALID_INPUT when result is missing core fields even if cacheResult is valid', async () => {
        const { loadMessageManifest } = await importActualSessionModule()
        const { SessionError } = await importActualSessionErrors()
        const db = createMockDb()
        db.chatMessageManifest.findFirst = mock(() =>
            Promise.resolve({
                version: 1,
                runId: 'run-6',
                manifest: JSON.stringify({
                    runId: 'run-6',
                    createdAt: '2024-06-04T00:00:00.000Z',
                    input: {
                        channel: 'web',
                        mode: 'conversation',
                        agentType: 'trading-agent',
                        rawMessages: [],
                        defaults: {},
                    },
                    pluginOutputs: [],
                    assembledContext: {
                        segments: [],
                        systemSegments: [],
                        tools: [],
                        params: { candidates: [], resolved: {} },
                        totalEstimatedInputTokens: 0,
                    },
                    modelRequest: {
                        systemText: '',
                        modelMessages: [],
                        toolNames: [],
                        resolvedParams: {},
                        providerOptions: {},
                    },
                    result: {
                        cacheResult: {
                            cacheObserved: true,
                            evidenceSource: 'totalUsage',
                            cacheReadTokens: 1,
                            cacheWriteTokens: 2,
                            uncachedInputTokens: 3,
                            cachedTokenRatio: 0.25,
                            providerRawCacheUsage: {},
                            rolloutGateStatus: 'enabled',
                            circuitBreakerState: 'closed',
                        },
                    },
                }),
            }),
        ) as typeof db.chatMessageManifest.findFirst

        try {
            await loadMessageManifest('session-1', 'message-1', {
                db,
            } as unknown as SessionDeps)
            expect.unreachable('Should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionError)
            expect((error as InstanceType<typeof SessionError>).code).toBe(
                'INVALID_INPUT',
            )
        }
    })
})
