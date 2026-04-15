/**
 * Live smoke tests for research tools (webSearch / webFetch).
 *
 * These tests call REAL external APIs — they require API keys
 * and network access. Skipped automatically when keys are missing.
 *
 * Run:  bun run test:live
 */

import { afterAll, describe, expect, it } from 'bun:test'
import {
    clearFetchCache,
    createDefaultResearchDeps,
    createResearchTools,
} from '@/core/ai/research'

const HAS_TAVILY = !!process.env.TAVILY_API_KEY
const HAS_AI = !!(process.env.AI_API_KEY && process.env.AI_BASE_URL)
const HAS_SEARCH_MODEL =
    HAS_AI || !!(process.env.SEARCH_API_KEY && process.env.SEARCH_BASE_URL)

// Content-rich, stable public URL (Wikipedia returns > 500 chars markdown)
const TEST_URL = 'https://en.wikipedia.org/wiki/NVIDIA'

// ────────────────────────────────────────────────────
// Group 1: readPage (needs network, works with proxy)
// Run FIRST — Tavily test leaks can contaminate later groups
// ────────────────────────────────────────────────────

describe('readPage (live HTTP fetch)', () => {
    const deps = createDefaultResearchDeps()

    afterAll(() => clearFetchCache())

    it('fetches a content-rich URL and returns markdown', async () => {
        const result = await deps.readPage(TEST_URL)

        expect(result).toHaveProperty('content')
        expect(result).toHaveProperty('bytesFetched')
        expect(result).toHaveProperty('truncated')
        expect(result).toHaveProperty('source')
        expect(typeof result.content).toBe('string')
        expect(result.content.length).toBeGreaterThan(500)
        expect(typeof result.bytesFetched).toBe('number')
        expect(result.bytesFetched).toBeGreaterThan(0)
        expect(typeof result.truncated).toBe('boolean')
        expect(['direct', 'jina']).toContain(result.source)
    }, 30_000)

    it('markdown does not contain raw HTML tags', async () => {
        const result = await deps.readPage(TEST_URL)

        expect(result.content).not.toContain('<html')
        expect(result.content).not.toContain('<body')
        expect(result.content).not.toContain('<script')
        expect(result.content.toLowerCase()).toContain('nvidia')
    }, 30_000)
})

// ────────────────────────────────────────────────────
// Group 2: webFetch tool (needs network + AI model, works with proxy)
// ────────────────────────────────────────────────────

describe.skipIf(!HAS_AI)('webFetch tool (live)', () => {
    const tools = createResearchTools()
    const toolCtx = {
        toolCallId: 'live-wf-1',
        messages: [] as never[],
        abortSignal: AbortSignal.timeout(60_000),
    }

    afterAll(() => clearFetchCache())

    it('reads a page and returns summary', async () => {
        const result = (await tools.webFetch.execute(
            {
                url: TEST_URL,
                question:
                    'What does NVIDIA do and what are their main products?',
            },
            toolCtx,
        )) as {
            url?: string
            summary?: string
            content?: string
            bytesFetched?: number
            source?: string
            error?: string
        }

        if (result.error) {
            throw new Error(`webFetch returned error: ${result.error}`)
        }

        expect(result.url).toBe(TEST_URL)

        // Either summary (normal) or content (summarize fallback)
        const text = result.summary ?? result.content
        expect(typeof text).toBe('string')
        expect(text).toBeTruthy()
        if (!text) throw new Error('Expected webFetch text content')
        expect(text.length).toBeGreaterThan(0)

        expect(typeof result.bytesFetched).toBe('number')
        expect(['direct', 'jina']).toContain(result.source)
    }, 60_000)

    it('second webFetch with same URL skips HTTP (cache hit)', async () => {
        // First call already ran in previous test, cache is populated.
        // Second call with different question: readPage is cached, only summarize runs.
        const start = Date.now()
        const result = (await tools.webFetch.execute(
            {
                url: TEST_URL,
                question: 'When was NVIDIA founded?',
            },
            toolCtx,
        )) as { summary?: string; content?: string; error?: string }
        const elapsed = Date.now() - start

        expect(result.error).toBeUndefined()
        const text = result.summary ?? result.content
        expect(typeof text).toBe('string')
        expect(text).toBeTruthy()
        if (!text) throw new Error('Expected cached webFetch text content')
        expect(text.length).toBeGreaterThan(0)

        // Cached: skip HTTP fetch (~1s), only AI summarize (~2-3s)
        // Without cache: HTTP + AI would be ~4-5s
        // This is a soft check — just verify it completes reasonably fast
        expect(elapsed).toBeLessThan(30_000)
    }, 30_000)
})

// ────────────────────────────────────────────────────
// Group 3: Tavily searchWeb (needs TAVILY_API_KEY)
// ────────────────────────────────────────────────────

describe.skipIf(!HAS_TAVILY)('searchWeb (live Tavily)', () => {
    const deps = createDefaultResearchDeps()

    it('returns results with expected shape', async () => {
        const res = await deps.searchWeb('NVIDIA earnings 2025')

        expect(res).toHaveProperty('results')
        expect(Array.isArray(res.results)).toBe(true)
        expect(res.results.length).toBeGreaterThan(0)

        const first = res.results[0]
        expect(typeof first.title).toBe('string')
        expect(typeof first.url).toBe('string')
        expect(typeof first.content).toBe('string')
        expect(typeof first.score).toBe('number')
        expect(first.url).toMatch(/^https?:\/\//)
        expect(first.score).toBeGreaterThan(0)
    }, 30_000)

    it('topic=finance returns finance results', async () => {
        const res = await deps.searchWeb('AAPL stock price', {
            topic: 'finance',
            maxResults: 3,
        })

        expect(res.results.length).toBeGreaterThan(0)
        expect(res.results.length).toBeLessThanOrEqual(3)
    }, 30_000)
})

// ────────────────────────────────────────────────────
// Group 4: webSearch tool (needs TAVILY + SEARCH_MODEL)
// ────────────────────────────────────────────────────

describe.skipIf(!HAS_TAVILY || !HAS_SEARCH_MODEL)(
    'webSearch tool (live)',
    () => {
        const tools = createResearchTools()
        const toolCtx = {
            toolCallId: 'live-ws-1',
            messages: [] as never[],
            abortSignal: AbortSignal.timeout(300_000),
        }

        it('returns report and sources for a finance query', async () => {
            const result = (await tools.webSearch.execute(
                { query: 'NVDA analyst rating changes 2025' },
                toolCtx,
            )) as {
                report?: string
                sources?: Array<{ title: string; url: string; score: number }>
                error?: string
            }

            if (result.error) {
                throw new Error(`webSearch returned error: ${result.error}`)
            }

            expect(typeof result.report).toBe('string')
            expect(result.report).toBeTruthy()
            if (!result.report) throw new Error('Expected webSearch report')
            expect(result.report.length).toBeGreaterThan(50)

            expect(Array.isArray(result.sources)).toBe(true)
            expect(result.sources).toBeTruthy()
            if (!result.sources) throw new Error('Expected webSearch sources')
            expect(result.sources.length).toBeGreaterThan(0)

            const first = result.sources[0]
            expect(typeof first.title).toBe('string')
            expect(typeof first.url).toBe('string')
            expect(typeof first.score).toBe('number')
            expect(first.url).toMatch(/^https?:\/\//)
        }, 120_000)

        it('sources are sorted by score descending', async () => {
            const result = (await tools.webSearch.execute(
                { query: 'Tesla earnings results' },
                toolCtx,
            )) as { sources?: Array<{ score: number }>; error?: string }

            if (result.error) {
                throw new Error(`webSearch returned error: ${result.error}`)
            }

            const sources = result.sources ?? []
            for (let i = 1; i < sources.length; i++) {
                expect(sources[i - 1].score).toBeGreaterThanOrEqual(
                    sources[i].score,
                )
            }
        }, 120_000)
    },
)
