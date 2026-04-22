import { describe, expect, it } from 'bun:test'
import type {
    MessageContextRecord,
    MessageContextState,
} from '@/lib/ai/context-visibility'
import {
    buildMessageContextSummaryModel,
    buildSegmentGroups,
} from '@/lib/ai/context-visibility'

function buildReadyState({
    includeMemory = true,
    includeRuntime = true,
    toolCount = 2,
    totalEstimatedInputTokens = 1240,
}: {
    includeMemory?: boolean
    includeRuntime?: boolean
    toolCount?: number
    totalEstimatedInputTokens?: number
} = {}): MessageContextState {
    const segments = [
        {
            id: 'recent-1',
            target: 'messages' as const,
            kind: 'history.recent' as const,
            payload: {
                format: 'messages' as const,
                messages: [
                    {
                        id: 'user-1',
                        role: 'user' as const,
                        parts: [{ type: 'text', text: 'Compare NVDA and AMD' }],
                    },
                ],
            },
            source: { plugin: 'session', origin: 'chat' },
            priority: 'high' as const,
            cacheability: 'session' as const,
            compactability: 'summarize' as const,
            estimatedTokens: 480,
        },
        {
            id: 'system-1',
            target: 'system' as const,
            kind: 'system.base' as const,
            payload: { format: 'text' as const, text: 'Base prompt text' },
            source: { plugin: 'prompt' },
            priority: 'required' as const,
            cacheability: 'stable' as const,
            compactability: 'preserve' as const,
            estimatedTokens: 220,
        },
    ]

    if (includeMemory) {
        segments.push({
            id: 'memory-1',
            target: 'messages' as const,
            kind: 'memory.long_lived' as const,
            payload: {
                format: 'text' as const,
                text: 'Prefers medium-term semiconductor trades',
            },
            source: { plugin: 'memory', origin: 'profile' },
            priority: 'medium' as const,
            cacheability: 'stable' as const,
            compactability: 'summarize' as const,
            estimatedTokens: 320,
        })
    }

    if (includeRuntime) {
        segments.push({
            id: 'runtime-1',
            target: 'messages' as const,
            kind: 'live.runtime' as const,
            payload: {
                format: 'text' as const,
                text: 'symbol=NVDA channel=web mode=conversation',
            },
            source: { plugin: 'runtime', origin: 'chat' },
            priority: 'high' as const,
            cacheability: 'volatile' as const,
            compactability: 'trim' as const,
            estimatedTokens: 180,
        })
    }

    const record: MessageContextRecord = {
        version: 1,
        runId: 'run-92',
        manifest: {
            input: {
                channel: 'web',
                mode: 'conversation',
                agentType: 'trading-agent',
                rawMessages: [],
                resolvedSessionId: 'session-1',
                defaults: {},
            },
            pluginOutputs: [],
            assembledContext: {
                segments,
                systemSegments: segments.filter((segment) =>
                    segment.kind.startsWith('system'),
                ),
                tools: Array.from({ length: toolCount }, (_, index) => ({
                    name: `tool-${index + 1}`,
                    definition: { tool: {} },
                    source: 'research',
                    manifestSpec: { description: `Tool ${index + 1}` },
                    estimatedTokens: 50,
                })),
                params: {
                    candidates: [],
                    resolved: {},
                },
                totalEstimatedInputTokens,
            },
            modelRequest: {
                systemText: 'Base prompt text',
                modelMessages: [],
                toolNames: Array.from({ length: toolCount }, (_, index) =>
                    `tool-${index + 1}`,
                ),
                resolvedParams: {},
                providerOptions: {},
            },
        },
    }

    return { status: 'ready', record }
}

describe('buildMessageContextSummaryModel', () => {
    it('builds chips and stats for a normal ready state', () => {
        const model = buildMessageContextSummaryModel(buildReadyState())

        expect(model.chips.map((chip) => chip.label)).toEqual([
            'Memory',
            'Recent',
            'Runtime',
            '2 tools',
        ])
        expect(model.statsLine).toBe('4 segments · ~1.2k input')
        expect(model.actionLabel).toBe('View context')
        expect(model.statusTone).toBe('neutral')
    })

    it('prioritizes the missing-memory warning', () => {
        const model = buildMessageContextSummaryModel(
            buildReadyState({ includeMemory: false, toolCount: 0 }),
        )

        expect(model.chips.map((chip) => chip.label)).toEqual([
            'Recent',
            'Runtime',
            '0 tools',
            'Large',
        ])
        expect(model.statsLine).toBe('Memory not included')
        expect(model.statusTone).toBe('warning')
    })
})

describe('buildSegmentGroups', () => {
    it('groups segments by source type with system last', () => {
        const readyState = buildReadyState()
        const groups = buildSegmentGroups(readyState.record)

        expect(groups.map((group) => group.key)).toEqual([
            'recent',
            'memory',
            'runtime',
            'system',
        ])
        expect(groups[0]?.title).toBe('Recent conversation')
        expect(groups[3]?.collapsedByDefault).toBe(true)
    })
})
