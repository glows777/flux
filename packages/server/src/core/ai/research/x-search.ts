import { xai } from '@ai-sdk/xai'
import { generateText, tool } from 'ai'
import { z } from 'zod'
import { getModel } from '@/core/ai/providers'
import {
    RESEARCH_TIMEOUTS,
    X_SEARCH_CACHE_MAX_SIZE,
    X_SEARCH_CACHE_TTL,
    X_SEARCH_CONFIG,
    X_SEARCH_SYSTEM_PROMPT,
} from './types'

// ─── Types ───

interface XSearchSource {
    title: string
    url: string
    score: number
}

type XSearchSuccess = {
    report: string
    sources: XSearchSource[]
}

type XSearchError = { error: string }

type XSearchResult = XSearchSuccess | XSearchError

// ─── Cache ───

interface CacheEntry {
    result: XSearchSuccess
    expireAt: number
}

const cache = new Map<string, CacheEntry>()

function makeCacheKey(
    query: string,
    timeRange?: { from?: string; to?: string },
    handles?: string[],
): string {
    return JSON.stringify({ query, timeRange, handles })
}

function getCached(key: string): XSearchSuccess | null {
    const entry = cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expireAt) {
        cache.delete(key)
        return null
    }
    // LRU refresh
    cache.delete(key)
    cache.set(key, entry)
    return entry.result
}

function setCache(key: string, result: XSearchSuccess): void {
    if (cache.size >= X_SEARCH_CACHE_MAX_SIZE) {
        const oldestKey = cache.keys().next().value
        if (oldestKey !== undefined) {
            cache.delete(oldestKey)
        }
    }
    cache.set(key, { result, expireAt: Date.now() + X_SEARCH_CACHE_TTL })
}

export function clearXSearchCache(): void {
    cache.clear()
}

export function getXSearchCacheSize(): number {
    return cache.size
}

// ─── Citation Extraction ───

interface GenerateTextSource {
    sourceType: string
    url?: string
    title?: string
}

function extractCitations(
    sources: GenerateTextSource[] | undefined,
): XSearchSource[] {
    if (!sources || sources.length === 0) return []

    const seen = new Map<string, XSearchSource>()
    for (let i = 0; i < sources.length; i++) {
        const s = sources[i]
        if (s.sourceType !== 'url' || !s.url) continue
        if (seen.has(s.url)) continue

        const title = s.title || new URL(s.url).hostname
        // Use inverse index as score proxy (earlier = more relevant)
        const score = 1 - i / sources.length
        seen.set(s.url, {
            title,
            url: s.url,
            score: Math.round(score * 100) / 100,
        })
    }

    return [...seen.values()]
}

// ─── Tool Factory ───

export function createSearchXTool() {
    return tool({
        description:
            'Search X (Twitter) for real-time social discussions, breaking news, KOL opinions, and market sentiment. Use this tool when you need the latest, most up-to-date information from social media — especially for market sentiment, trending topics, and reactions to recent events. Supports filtering by date range and specific X handles.',
        inputSchema: z.object({
            query: z.string(),
            timeRange: z
                .object({
                    from: z.string().optional(),
                    to: z.string().optional(),
                })
                .optional(),
            handles: z.array(z.string()).max(10).optional(),
        }),
        execute: async (
            { query, timeRange, handles },
            { abortSignal },
        ): Promise<XSearchResult> => {
            // Check API key before doing anything
            if (!process.env.XAI_API_KEY) {
                return {
                    error: 'X search unavailable: XAI_API_KEY not configured',
                }
            }

            // Check cache
            const cacheKey = makeCacheKey(query, timeRange, handles)
            const cached = getCached(cacheKey)
            if (cached) return cached

            try {
                const combinedSignal = AbortSignal.any([
                    ...(abortSignal ? [abortSignal] : []),
                    AbortSignal.timeout(RESEARCH_TIMEOUTS.searchX),
                ])

                const xaiModel = getModel('xSearch')

                // xai.tools return types use FlexibleSchema<{}> which is incompatible
                // with generateText's Tool<never> constraint — cast to satisfy the checker
                const tools = {
                    web_search: xai.tools.webSearch(),
                    x_search: xai.tools.xSearch({
                        ...(handles ? { allowedXHandles: handles } : {}),
                        ...(timeRange?.from
                            ? { fromDate: timeRange.from }
                            : {}),
                        ...(timeRange?.to ? { toDate: timeRange.to } : {}),
                        enableImageUnderstanding:
                            X_SEARCH_CONFIG.enableImageUnderstanding,
                        enableVideoUnderstanding:
                            X_SEARCH_CONFIG.enableVideoUnderstanding,
                    }),
                } as Parameters<typeof generateText>[0]['tools']

                const result = await generateText({
                    model: xaiModel,
                    system: X_SEARCH_SYSTEM_PROMPT,
                    prompt: query,
                    tools,
                    abortSignal: combinedSignal,
                })

                const sources = extractCitations(
                    result.sources as GenerateTextSource[] | undefined,
                )

                const success: XSearchSuccess = { report: result.text, sources }
                setCache(cacheKey, success)
                return success
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : String(error)
                if (
                    msg.includes('aborted') ||
                    msg.includes('AbortError') ||
                    (error instanceof Error && error.name === 'AbortError')
                ) {
                    return { error: 'searchX timed out' }
                }
                return { error: msg }
            }
        },
    })
}
