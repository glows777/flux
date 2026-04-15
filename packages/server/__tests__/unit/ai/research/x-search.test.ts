import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

// ─── Mock external modules ───

const mockGenerateText = mock(() =>
    Promise.resolve({
        text: 'X sentiment report: TSLA is trending bullish on social media.',
        sources: [
            {
                sourceType: 'url',
                url: 'https://x.com/i/status/123',
                title: 'Tweet about TSLA',
            },
            {
                sourceType: 'url',
                url: 'https://reuters.com/tsla',
                title: 'Reuters TSLA',
            },
        ],
    }),
)

mock.module('ai', () => ({
    tool: (config: unknown) => {
        const c = config as {
            description: string
            inputSchema: unknown
            execute: (...args: unknown[]) => unknown
        }
        return {
            description: c.description,
            execute: c.execute,
            inputSchema: c.inputSchema,
        }
    },
    generateText: mockGenerateText,
}))

const mockWebSearch = mock(() => ({}))
const mockXSearch = mock(() => ({}))

mock.module('@ai-sdk/xai', () => ({
    xai: {
        tools: {
            webSearch: mockWebSearch,
            xSearch: mockXSearch,
        },
    },
}))

const mockGetModel = mock(() => ({ modelId: 'grok-4-1-fast' }))

mock.module('@/core/ai/providers', () => ({
    getModel: mockGetModel,
}))

// ─── Import after mocks ───

import {
    clearXSearchCache,
    createSearchXTool,
    getXSearchCacheSize,
} from '@/core/ai/research/x-search'

// ─── Env helpers ───

const savedKey = process.env.XAI_API_KEY

function setTestEnv() {
    process.env.XAI_API_KEY = 'test-xai-key'
}

function restoreEnv() {
    if (savedKey !== undefined) process.env.XAI_API_KEY = savedKey
    else delete process.env.XAI_API_KEY
}

// ─── Tests ───

describe('createSearchXTool', () => {
    beforeEach(() => {
        setTestEnv()
        clearXSearchCache()
        mockGenerateText.mockClear()
        mockWebSearch.mockClear()
        mockXSearch.mockClear()
        mockGetModel.mockClear()
    })

    afterEach(() => {
        restoreEnv()
        clearXSearchCache()
    })

    const toolCtx = {
        toolCallId: 'test-1',
        messages: [] as never[],
        abortSignal: new AbortController().signal,
    }

    it('returns a tool object with description and execute', () => {
        const t = createSearchXTool()
        expect(t).toHaveProperty('description')
        expect(t).toHaveProperty('execute')
        expect(typeof t.description).toBe('string')
        expect(t.description).toContain('X (Twitter)')
    })

    describe('API key missing', () => {
        it('returns error when XAI_API_KEY is not set', async () => {
            delete process.env.XAI_API_KEY
            const t = createSearchXTool()
            const result = (await t.execute(
                { query: 'TSLA sentiment' },
                toolCtx,
            )) as { error: string }

            expect(result).toHaveProperty('error')
            expect(result.error).toContain('XAI_API_KEY not configured')
            expect(mockGenerateText).not.toHaveBeenCalled()
        })
    })

    describe('generateText call parameters', () => {
        it('calls generateText with xSearch model', async () => {
            const t = createSearchXTool()
            await t.execute({ query: 'test' }, toolCtx)

            expect(mockGetModel).toHaveBeenCalledWith('xSearch')
            expect(mockGenerateText).toHaveBeenCalledTimes(1)
        })

        it('passes query as prompt', async () => {
            const t = createSearchXTool()
            await t.execute({ query: 'NVDA social buzz' }, toolCtx)

            const call = mockGenerateText.mock.calls[0][0] as Record<
                string,
                unknown
            >
            expect(call.prompt).toBe('NVDA social buzz')
        })

        it('passes system prompt', async () => {
            const t = createSearchXTool()
            await t.execute({ query: 'test' }, toolCtx)

            const call = mockGenerateText.mock.calls[0][0] as Record<
                string,
                unknown
            >
            expect(typeof call.system).toBe('string')
            expect(call.system).toContain('research assistant')
        })

        it('configures xai tools (web_search + x_search)', async () => {
            const t = createSearchXTool()
            await t.execute({ query: 'test' }, toolCtx)

            const call = mockGenerateText.mock.calls[0][0] as Record<
                string,
                unknown
            >
            const tools = call.tools as Record<string, unknown>
            expect(tools).toHaveProperty('web_search')
            expect(tools).toHaveProperty('x_search')
            expect(mockWebSearch).toHaveBeenCalledTimes(1)
            expect(mockXSearch).toHaveBeenCalledTimes(1)
        })

        it('passes handles as allowedXHandles when provided', async () => {
            const t = createSearchXTool()
            await t.execute(
                { query: 'test', handles: ['elonmusk', 'jimcramer'] },
                toolCtx,
            )

            const xSearchCall = mockXSearch.mock.calls[0][0] as Record<
                string,
                unknown
            >
            expect(xSearchCall.allowedXHandles).toEqual([
                'elonmusk',
                'jimcramer',
            ])
        })

        it('passes timeRange as fromDate/toDate when provided', async () => {
            const t = createSearchXTool()
            await t.execute(
                {
                    query: 'test',
                    timeRange: { from: '2026-03-01', to: '2026-03-27' },
                },
                toolCtx,
            )

            const xSearchCall = mockXSearch.mock.calls[0][0] as Record<
                string,
                unknown
            >
            expect(xSearchCall.fromDate).toBe('2026-03-01')
            expect(xSearchCall.toDate).toBe('2026-03-27')
        })

        it('does not pass handles when not provided', async () => {
            const t = createSearchXTool()
            await t.execute({ query: 'test' }, toolCtx)

            const xSearchCall = mockXSearch.mock.calls[0][0] as Record<
                string,
                unknown
            >
            expect(xSearchCall.allowedXHandles).toBeUndefined()
        })

        it('passes abortSignal', async () => {
            const t = createSearchXTool()
            await t.execute({ query: 'test' }, toolCtx)

            const call = mockGenerateText.mock.calls[0][0] as Record<
                string,
                unknown
            >
            expect(call.abortSignal).toBeDefined()
        })
    })

    describe('return value', () => {
        it('report comes from result.text', async () => {
            const t = createSearchXTool()
            const result = (await t.execute({ query: 'test' }, toolCtx)) as {
                report: string
            }

            expect(result.report).toBe(
                'X sentiment report: TSLA is trending bullish on social media.',
            )
        })

        it('sources extracted from result.sources', async () => {
            const t = createSearchXTool()
            const result = (await t.execute({ query: 'test' }, toolCtx)) as {
                sources: Array<{ title: string; url: string; score: number }>
            }

            expect(result.sources).toHaveLength(2)
            expect(result.sources[0].url).toBe('https://x.com/i/status/123')
            expect(result.sources[0].title).toBe('Tweet about TSLA')
            expect(typeof result.sources[0].score).toBe('number')
        })

        it('sources deduped by URL', async () => {
            mockGenerateText.mockImplementation(() =>
                Promise.resolve({
                    text: 'report',
                    sources: [
                        {
                            sourceType: 'url',
                            url: 'https://x.com/1',
                            title: 'T1',
                        },
                        {
                            sourceType: 'url',
                            url: 'https://x.com/1',
                            title: 'T1 dup',
                        },
                        {
                            sourceType: 'url',
                            url: 'https://x.com/2',
                            title: 'T2',
                        },
                    ],
                }),
            )
            const t = createSearchXTool()
            const result = (await t.execute({ query: 'test' }, toolCtx)) as {
                sources: Array<{ url: string }>
            }

            expect(result.sources).toHaveLength(2)
        })

        it('handles empty sources gracefully', async () => {
            mockGenerateText.mockImplementation(() =>
                Promise.resolve({ text: 'no social data found', sources: [] }),
            )
            const t = createSearchXTool()
            const result = (await t.execute({ query: 'test' }, toolCtx)) as {
                sources: unknown[]
            }

            expect(result.sources).toEqual([])
        })

        it('handles undefined sources gracefully', async () => {
            mockGenerateText.mockImplementation(() =>
                Promise.resolve({ text: 'report', sources: undefined }),
            )
            const t = createSearchXTool()
            const result = (await t.execute({ query: 'test' }, toolCtx)) as {
                sources: unknown[]
            }

            expect(result.sources).toEqual([])
        })
    })

    describe('cache', () => {
        it('returns cached result on second call with same params', async () => {
            const t = createSearchXTool()
            await t.execute({ query: 'TSLA sentiment' }, toolCtx)
            expect(mockGenerateText).toHaveBeenCalledTimes(1)

            await t.execute({ query: 'TSLA sentiment' }, toolCtx)
            expect(mockGenerateText).toHaveBeenCalledTimes(1) // not called again
        })

        it('different query bypasses cache', async () => {
            const t = createSearchXTool()
            await t.execute({ query: 'TSLA' }, toolCtx)
            await t.execute({ query: 'NVDA' }, toolCtx)

            expect(mockGenerateText).toHaveBeenCalledTimes(2)
        })

        it('different handles bypasses cache', async () => {
            const t = createSearchXTool()
            await t.execute({ query: 'test', handles: ['elonmusk'] }, toolCtx)
            await t.execute({ query: 'test', handles: ['jimcramer'] }, toolCtx)

            expect(mockGenerateText).toHaveBeenCalledTimes(2)
        })

        it('clearXSearchCache empties the cache', async () => {
            const t = createSearchXTool()
            await t.execute({ query: 'test' }, toolCtx)
            expect(getXSearchCacheSize()).toBe(1)

            clearXSearchCache()
            expect(getXSearchCacheSize()).toBe(0)

            await t.execute({ query: 'test' }, toolCtx)
            expect(mockGenerateText).toHaveBeenCalledTimes(2) // called again
        })
    })

    describe('error handling', () => {
        it('generateText throws -> returns { error }', async () => {
            mockGenerateText.mockImplementation(() =>
                Promise.reject(new Error('Grok API error')),
            )
            const t = createSearchXTool()
            const result = (await t.execute({ query: 'test' }, toolCtx)) as {
                error: string
            }

            expect(result).toHaveProperty('error')
            expect(result.error).toContain('Grok API error')
        })

        it('timeout -> returns { error: "searchX timed out" }', async () => {
            mockGenerateText.mockImplementation(
                () =>
                    new Promise((_, reject) => {
                        const err = new Error('The operation was aborted')
                        err.name = 'AbortError'
                        setTimeout(() => reject(err), 10)
                    }),
            )
            const t = createSearchXTool()
            const result = (await t.execute({ query: 'test' }, toolCtx)) as {
                error: string
            }

            expect(result).toHaveProperty('error')
            expect(result.error).toContain('timed out')
        })

        it('errors are NOT cached', async () => {
            mockGenerateText.mockImplementationOnce(() =>
                Promise.reject(new Error('temporary failure')),
            )
            const t = createSearchXTool()

            await t.execute({ query: 'test' }, toolCtx) // error
            expect(getXSearchCacheSize()).toBe(0)

            mockGenerateText.mockImplementation(() =>
                Promise.resolve({ text: 'ok', sources: [] }),
            )
            const result = (await t.execute({ query: 'test' }, toolCtx)) as {
                report: string
            }
            expect(result.report).toBe('ok')
        })
    })
})
