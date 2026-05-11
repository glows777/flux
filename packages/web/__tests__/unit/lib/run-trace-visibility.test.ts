import { describe, expect, it, mock } from 'bun:test'
import type { UIMessage } from 'ai'
import type {
    RunTracePayload,
    RunTraceState,
} from '@/lib/ai/run-trace-visibility'
import {
    buildRunTraceSummaryModel,
    buildTraceSegmentGroups,
    fetchRunTrace,
    getRunIdFromMessage,
    isRunTraceResponse,
} from '@/lib/ai/run-trace-visibility'

function buildTrace(): RunTracePayload {
    return {
        version: 1,
        runId: 'run-1',
        traceStatus: 'complete',
        runOutcome: 'succeeded',
        currentPhase: 'after_run',
        completedPhases: ['created', 'before_run', 'after_run'],
        updatedAt: '2026-05-11T00:00:00.000Z',
        prompt: {
            totalEstimatedInputTokens: 1240,
            finalInput: {
                systemText: 'Base prompt',
                modelMessages: [{ role: 'user', content: 'Compare NVDA' }],
                tools: [
                    {
                        name: 'quoteLookup',
                        sourcePlugin: 'market',
                        estimatedTokens: 50,
                    },
                    {
                        name: 'webSearch',
                        sourcePlugin: 'research',
                    },
                ],
                params: { resolved: { maxSteps: 4 }, candidates: [] },
            },
            segments: [
                {
                    id: 'recent-1',
                    target: 'messages',
                    kind: 'history.recent',
                    sourcePlugin: 'session',
                    origin: 'recent window',
                    messageIds: ['user-1', 'assistant-1'],
                    messageCount: 2,
                    roles: ['user', 'assistant'],
                    contentHash: 'hash-recent',
                    cacheability: 'session',
                    compactability: 'summarize',
                },
                {
                    id: 'system-1',
                    target: 'system',
                    kind: 'system.base',
                    sourcePlugin: 'prompt',
                    finalOrder: 0,
                    content: { format: 'text', text: 'Base prompt' },
                    contentHash: 'hash-system',
                    estimatedTokens: 220,
                    cacheability: 'stable',
                    compactability: 'preserve',
                },
                {
                    id: 'runtime-1',
                    target: 'messages',
                    kind: 'live.runtime',
                    sourcePlugin: 'runtime',
                    origin: 'symbol',
                    messageIds: ['runtime-1'],
                    messageCount: 1,
                    roles: ['system'],
                    contentHash: 'hash-runtime',
                    cacheability: 'volatile',
                    compactability: 'trim',
                },
            ],
        },
        cache: {
            result: {
                cacheObserved: true,
                evidenceSource: 'both',
                cacheReadObserved: true,
                cacheWriteObserved: true,
                cacheReadEvidenceSource: 'providerMetadata',
                cacheWriteEvidenceSource: 'totalUsage',
                cacheReadTokens: 900,
                cacheWriteTokens: 300,
                rolloutGateStatus: 'enabled',
                circuitBreakerState: 'closed',
            },
        },
    }
}

function buildReadyState(trace = buildTrace()): RunTraceState {
    return {
        status: 'ready',
        record: {
            run: {
                id: trace.runId,
                status: 'completed',
                startedAt: '2026-05-11T00:00:00.000Z',
                finishedAt: '2026-05-11T00:00:01.000Z',
            },
            trace,
        },
    }
}

describe('getRunIdFromMessage', () => {
    it('returns only a non-empty metadata run id', () => {
        expect(
            getRunIdFromMessage({
                id: 'assistant-1',
                role: 'assistant',
                metadata: { runId: ' run-1 ' },
            } as UIMessage<{ runId?: string }>),
        ).toBe('run-1')

        expect(
            getRunIdFromMessage({
                id: 'assistant-2',
                role: 'assistant',
                metadata: { runId: '   ' },
            } as UIMessage<{ runId?: string }>),
        ).toBeNull()
        expect(getRunIdFromMessage(undefined)).toBeNull()
    })
})

describe('isRunTraceResponse', () => {
    it('guards the run-scoped trace response shape', () => {
        expect(
            isRunTraceResponse({
                success: true,
                data: {
                    run: {
                        id: 'run-1',
                        status: 'completed',
                        startedAt: '2026-05-11T00:00:00.000Z',
                        finishedAt: null,
                    },
                    trace: buildTrace(),
                },
            }),
        ).toBe(true)
        expect(isRunTraceResponse({ success: true, data: buildTrace() })).toBe(
            false,
        )
    })
})

describe('buildRunTraceSummaryModel', () => {
    it('summarizes ready traces with cache, tool, segment, and input chips', () => {
        const model = buildRunTraceSummaryModel(buildReadyState())

        expect(model.chips.map((chip) => chip.label)).toEqual([
            'Cache read',
            'Cache write',
            '2 tools',
            '3 segments',
        ])
        expect(model.statsLine).toBe('Trace complete · succeeded · ~1.2k input')
        expect(model.actionLabel).toBe('View trace')
    })

    it('exposes unavailable and error states with trace wording', () => {
        expect(
            buildRunTraceSummaryModel({ status: 'unavailable' }).actionLabel,
        ).toBe('Trace unavailable')
        expect(
            buildRunTraceSummaryModel({ status: 'error', error: 'boom' })
                .actionLabel,
        ).toBe('Trace error')
    })
})

describe('buildTraceSegmentGroups', () => {
    it('groups trace prompt segments by kind and source plugin', () => {
        const groups = buildTraceSegmentGroups(buildReadyState().record)

        expect(groups.map((group) => group.key)).toEqual([
            'history.recent:session',
            'live.runtime:runtime',
            'system.base:prompt',
        ])
        expect(groups[0]?.title).toBe('history.recent · session')
        expect(groups[0]?.messageCount).toBe(2)
        expect(groups[2]?.collapsedByDefault).toBe(true)
    })
})

describe('fetchRunTrace', () => {
    it('fetches the run-scoped trace endpoint', async () => {
        const fetchMock = mock(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                    Promise.resolve({
                        success: true,
                        data: {
                            run: {
                                id: 'run-1',
                                status: 'completed',
                                startedAt: '2026-05-11T00:00:00.000Z',
                                finishedAt: null,
                            },
                            trace: buildTrace(),
                        },
                    }),
            }),
        )
        global.fetch = fetchMock as typeof fetch

        await expect(fetchRunTrace('run/1')).resolves.toMatchObject({
            trace: { runId: 'run-1' },
        })
        expect(fetchMock).toHaveBeenCalledWith('/api/runs/run%2F1/trace', {
            headers: { Accept: 'application/json' },
        })
    })

    it('returns null for unavailable run traces', async () => {
        const fetchMock = mock(() =>
            Promise.resolve({
                ok: false,
                status: 404,
                json: () =>
                    Promise.resolve({
                        success: false,
                        error: 'Trace API disabled',
                    }),
            }),
        )
        global.fetch = fetchMock as typeof fetch

        await expect(fetchRunTrace('run-404')).resolves.toBeNull()
    })
})
