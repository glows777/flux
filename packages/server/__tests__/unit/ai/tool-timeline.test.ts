/**
 * Tool Timeline — Types, Constants, and SDK State Mapping
 *
 * Test scenarios:
 * - isDisplayTool returns true for display tools
 * - isDisplayTool returns false for non-display tools
 * - getFaviconUrl returns google favicon URL for valid URL
 * - getFaviconUrl returns empty string for invalid URL
 * - getFaviconUrl returns empty string for empty string
 * - mapToolState maps SDK states to timeline states
 */

import { describe, expect, it } from 'bun:test'
import {
    getFaviconUrl,
    groupPartsToSegments,
    isDisplayTool,
    mapToolState,
} from '@/core/ai/tool-timeline'

describe('isDisplayTool', () => {
    it('returns true for display tools', () => {
        expect(isDisplayTool('display_rating_card')).toBe(true)
        expect(isDisplayTool('display_comparison_table')).toBe(true)
        expect(isDisplayTool('display_signal_badges')).toBe(true)
    })

    it('returns false for non-display tools', () => {
        expect(isDisplayTool('getQuote')).toBe(false)
        expect(isDisplayTool('webSearch')).toBe(false)
        expect(isDisplayTool('memory_write')).toBe(false)
    })
})

describe('getFaviconUrl', () => {
    it('returns google favicon URL for valid URL', () => {
        expect(getFaviconUrl('https://seekingalpha.com/article/123')).toBe(
            'https://www.google.com/s2/favicons?domain=seekingalpha.com&sz=32',
        )
    })

    it('returns empty string for invalid URL', () => {
        expect(getFaviconUrl('not-a-url')).toBe('')
    })

    it('returns empty string for empty string', () => {
        expect(getFaviconUrl('')).toBe('')
    })
})

describe('mapToolState', () => {
    it('maps input-streaming to running', () => {
        expect(mapToolState('input-streaming')).toBe('running')
    })
    it('maps input-available to running', () => {
        expect(mapToolState('input-available')).toBe('running')
    })
    it('maps approval-requested to running', () => {
        expect(mapToolState('approval-requested')).toBe('running')
    })
    it('maps approval-responded to running', () => {
        expect(mapToolState('approval-responded')).toBe('running')
    })
    it('maps output-available to done', () => {
        expect(mapToolState('output-available')).toBe('done')
    })
    it('maps output-error to error', () => {
        expect(mapToolState('output-error')).toBe('error')
    })
    it('maps output-denied to error', () => {
        expect(mapToolState('output-denied')).toBe('error')
    })
    it('maps undefined to pending', () => {
        expect(mapToolState(undefined)).toBe('pending')
    })
    it('maps unknown string to pending', () => {
        expect(mapToolState('some-future-state')).toBe('pending')
    })
})

describe('groupPartsToSegments', () => {
    it('returns empty array for empty parts', () => {
        expect(groupPartsToSegments([])).toEqual([])
    })

    it('groups consecutive tool parts into one timeline', () => {
        const parts = [
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'output-available',
                output: { price: 100 },
                input: { symbol: 'AAPL' },
            },
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'b',
                toolName: 'getNews',
                state: 'output-available',
                output: [{ title: 'News' }],
                input: { symbol: 'AAPL' },
            },
        ]
        const segments = groupPartsToSegments(parts)
        expect(segments).toHaveLength(1)
        expect(segments[0].type).toBe('timeline')
        if (segments[0].type === 'timeline') {
            expect(segments[0].steps).toHaveLength(2)
            expect(segments[0].collapsed).toBe(true) // all done
        }
    })

    it('text part closes current timeline', () => {
        const parts = [
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'output-available',
                output: { price: 100 },
                input: {},
            },
            { type: 'text' as const, text: 'Here is the result' },
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'b',
                toolName: 'getNews',
                state: 'output-available',
                output: [],
                input: {},
            },
        ]
        const segments = groupPartsToSegments(parts)
        expect(segments).toHaveLength(3)
        expect(segments[0].type).toBe('timeline')
        expect(segments[1].type).toBe('text')
        expect(segments[2].type).toBe('timeline')
    })

    it('display tool creates separate display segment', () => {
        const parts = [
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'output-available',
                output: {},
                input: {},
            },
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'b',
                toolName: 'display_rating_card',
                state: 'output-available',
                output: { symbol: 'AAPL', rating: '买入' },
                input: {},
            },
        ]
        const segments = groupPartsToSegments(parts)
        expect(segments).toHaveLength(2)
        expect(segments[0].type).toBe('timeline')
        expect(segments[1].type).toBe('display')
        if (segments[1].type === 'display') {
            expect(segments[1].toolName).toBe('display_rating_card')
        }
    })

    it('reasoning part joins current timeline', () => {
        const parts = [
            { type: 'reasoning' as const, text: 'Let me check the price' },
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'output-available',
                output: {},
                input: {},
            },
        ]
        const segments = groupPartsToSegments(parts)
        expect(segments).toHaveLength(1)
        if (segments[0].type === 'timeline') {
            expect(segments[0].steps).toHaveLength(2)
            expect(segments[0].steps[0].type).toBe('thinking')
            expect(segments[0].steps[1].type).toBe('tool')
        }
    })

    it('creates thinking-only timeline after text with fallback summary', () => {
        const parts = [
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'output-available',
                output: {},
                input: {},
            },
            { type: 'text' as const, text: 'Here is the result' },
            { type: 'reasoning' as const, text: 'Let me think more' },
        ]
        const segments = groupPartsToSegments(parts)
        expect(segments).toHaveLength(3)
        expect(segments[0].type).toBe('timeline')
        expect(segments[1].type).toBe('text')
        expect(segments[2].type).toBe('timeline')
    })

    it('preserves thinking within timelines that have tool steps', () => {
        const parts = [
            { type: 'reasoning' as const, text: 'Let me check' },
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'output-available',
                output: {},
                input: {},
            },
            { type: 'reasoning' as const, text: 'Now searching' },
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'b',
                toolName: 'webSearch',
                state: 'output-available',
                output: { sources: [] },
                input: { query: 'test' },
            },
        ]
        const segments = groupPartsToSegments(parts)
        expect(segments).toHaveLength(1)
        if (segments[0].type === 'timeline') {
            expect(segments[0].steps).toHaveLength(4) // thinking + tool + thinking + tool
            expect(segments[0].steps[0].type).toBe('thinking')
            expect(segments[0].steps[1].type).toBe('tool')
            expect(segments[0].steps[2].type).toBe('thinking')
            expect(segments[0].steps[3].type).toBe('tool')
        }
    })

    it('skips step-start parts silently', () => {
        const parts = [
            { type: 'step-start' as const },
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'output-available',
                output: {},
                input: {},
            },
        ]
        const segments = groupPartsToSegments(parts)
        expect(segments).toHaveLength(1)
        if (segments[0].type === 'timeline') {
            expect(segments[0].steps).toHaveLength(1)
        }
    })

    it('skips source-url parts silently', () => {
        const parts = [
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'output-available',
                output: {},
                input: {},
            },
            { type: 'source-url' as const, url: 'https://example.com' },
        ]
        const segments = groupPartsToSegments(parts)
        expect(segments).toHaveLength(1)
        if (segments[0].type === 'timeline') {
            expect(segments[0].steps).toHaveLength(1)
        }
    })

    it('sets collapsed false when timeline has running steps', () => {
        const parts = [
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'input-streaming',
                input: {},
            },
        ]
        const segments = groupPartsToSegments(parts)
        if (segments[0].type === 'timeline') {
            expect(segments[0].collapsed).toBe(false)
        }
    })

    it('sets startIndex from first part index', () => {
        const parts = [
            { type: 'text' as const, text: 'Hello' },
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'output-available',
                output: {},
                input: {},
            },
        ]
        const segments = groupPartsToSegments(parts)
        expect(segments[0].startIndex).toBe(0)
        expect(segments[1].startIndex).toBe(1)
    })

    it('maps SDK states correctly in steps', () => {
        const parts = [
            {
                type: 'dynamic-tool' as const,
                toolCallId: 'a',
                toolName: 'getQuote',
                state: 'output-error',
                input: {},
                errorText: 'Timeout',
            },
        ]
        const segments = groupPartsToSegments(parts)
        if (segments[0].type === 'timeline') {
            expect(segments[0].steps[0].state).toBe('error')
            expect(segments[0].steps[0].errorText).toBe('Timeout')
        }
    })
})

// ─── buildTimelineSummary ───

import type { TimelineStep } from '@/core/ai/tool-timeline'
import { buildTimelineSummary } from '@/core/ai/tool-timeline'

function makeStep(
    toolName: string,
    overrides?: Partial<TimelineStep>,
): TimelineStep {
    return { type: 'tool', toolName, state: 'done', partIndex: 0, ...overrides }
}

describe('buildTimelineSummary', () => {
    it('returns empty string for empty steps', () => {
        expect(buildTimelineSummary([])).toBe('')
    })

    it('returns fallback for thinking-only steps', () => {
        const steps: TimelineStep[] = [
            { type: 'thinking', text: 'Let me think', partIndex: 0 },
        ]
        expect(buildTimelineSummary(steps)).toBe('深度思考')
    })

    it('summarizes single quote query', () => {
        const steps = [makeStep('getQuote', { input: { symbol: 'AAPL' } })]
        expect(buildTimelineSummary(steps)).toBe('查询了 AAPL 报价。')
    })

    it('combines quote and company info', () => {
        const steps = [
            makeStep('getQuote', { input: { symbol: 'AAPL' } }),
            makeStep('getCompanyInfo', { input: { symbol: 'AAPL' } }),
        ]
        expect(buildTimelineSummary(steps)).toBe('查询了 AAPL 报价和公司信息。')
    })

    it('summarizes news', () => {
        const steps = [makeStep('getNews', { output: [1, 2, 3] })]
        expect(buildTimelineSummary(steps)).toBe('搜索了 3 条新闻。')
    })

    it('summarizes webSearch and webFetch as sources', () => {
        const steps = [
            makeStep('webSearch', { output: { sources: [1, 2, 3] } }),
            makeStep('webFetch'),
        ]
        expect(buildTimelineSummary(steps)).toBe('搜索了 4 个来源。')
    })

    it('summarizes indicators', () => {
        const steps = [makeStep('calculateIndicators')]
        expect(buildTimelineSummary(steps)).toBe('计算了技术指标。')
    })

    it('summarizes searchStock', () => {
        const steps = [makeStep('searchStock', { input: { query: 'apple' } })]
        expect(buildTimelineSummary(steps)).toBe('搜索了 "apple"。')
    })

    it('summarizes memory write tools', () => {
        const steps = [
            makeStep('update_core_memory', {
                output: {
                    success: true,
                    slot: 'lessons',
                    message: '已更新 lessons',
                },
            }),
        ]
        expect(buildTimelineSummary(steps)).toBe('更新了记忆。')
    })

    it('summarizes save_lesson', () => {
        const steps = [makeStep('save_lesson', { output: { success: true } })]
        expect(buildTimelineSummary(steps)).toBe('更新了记忆。')
    })

    it('summarizes read_history', () => {
        const steps = [
            makeStep('read_history', {
                output: { slot: 'lessons', versions: [{ id: '1' }] },
            }),
        ]
        expect(buildTimelineSummary(steps)).toBe('回顾了历史记录。')
    })

    it('combines multiple categories', () => {
        const steps = [
            makeStep('getQuote', { input: { symbol: 'AAPL' } }),
            makeStep('getCompanyInfo', { input: { symbol: 'AAPL' } }),
            makeStep('getNews', { output: [1, 2, 3] }),
            makeStep('webSearch', { output: { sources: [1, 2] } }),
            makeStep('calculateIndicators'),
        ]
        expect(buildTimelineSummary(steps)).toBe(
            '查询了 AAPL 报价和公司信息，搜索了 3 条新闻和 2 个来源，计算了技术指标。',
        )
    })

    it('ignores thinking steps', () => {
        const steps: TimelineStep[] = [
            { type: 'thinking', text: 'Let me check', partIndex: 0 },
            makeStep('getQuote', { input: { symbol: 'AAPL' } }),
        ]
        expect(buildTimelineSummary(steps)).toBe('查询了 AAPL 报价。')
    })

    it('appends error count', () => {
        const steps = [
            makeStep('getQuote', { input: { symbol: 'AAPL' }, state: 'done' }),
            makeStep('getNews', { state: 'error' }),
        ]
        expect(buildTimelineSummary(steps)).toBe(
            '查询了 AAPL 报价。（1 项失败）',
        )
    })
})
