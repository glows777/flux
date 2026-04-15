import { tavily } from '@tavily/core'
import { generateText } from 'ai'
import TurndownService from 'turndown'
import { getModel } from '@/core/ai/providers'
import { proxyFetch } from '@/core/market-data'
import type { PageContent, ResearchDeps, SearchOptions } from './types'
import {
    MIN_DIRECT_CONTENT_LENGTH,
    PAGE_CONTENT_MAX_CHARS,
    WEB_FETCH_SUMMARY_PROMPT,
} from './types'
import { createWebFetchTool } from './web-fetch'
import { createWebSearchTool } from './web-search'
import { createSearchXTool } from './x-search'

// ─── Re-exports ───

export type {
    PageContent,
    ResearchDeps,
    SearchOptions,
    SearchResponse,
    WebFetchError,
    WebFetchFallback,
    WebFetchResult,
    WebFetchSuccess,
} from './types'

export {
    FETCH_CACHE_MAX_SIZE,
    FETCH_CACHE_TTL,
    isPublicUrl,
    MIN_DIRECT_CONTENT_LENGTH,
    PAGE_CONTENT_MAX_CHARS,
    RESEARCH_TIMEOUTS,
    WEB_FETCH_SUMMARY_PROMPT,
    WEB_SEARCH_MAX_STEPS,
    WEB_SEARCH_SYSTEM_PROMPT,
    X_SEARCH_CACHE_MAX_SIZE,
    X_SEARCH_CACHE_TTL,
    X_SEARCH_CONFIG,
    X_SEARCH_SYSTEM_PROMPT,
} from './types'
export {
    clearFetchCache,
    createWebFetchTool,
    getFetchCacheSize,
} from './web-fetch'
export { createWebSearchTool } from './web-search'
export {
    clearXSearchCache,
    createSearchXTool,
    getXSearchCacheSize,
} from './x-search'

// ─── readPage ───

const turndown = new TurndownService()
turndown.remove(['script', 'style', 'noscript'])

async function fetchDirect(url: string): Promise<PageContent | null> {
    try {
        const response = await proxyFetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 FluxBot/1.0' },
            signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) return null

        const html = await response.text()
        const markdown = turndown.turndown(html)

        if (markdown.length < MIN_DIRECT_CONTENT_LENGTH) return null

        const truncated = markdown.length > PAGE_CONTENT_MAX_CHARS
        const content = truncated
            ? markdown.slice(0, PAGE_CONTENT_MAX_CHARS)
            : markdown

        return {
            content,
            bytesFetched: new Blob([markdown]).size,
            truncated,
            source: 'direct',
        }
    } catch {
        return null
    }
}

async function fetchJina(url: string): Promise<PageContent> {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`
    const headers: Record<string, string> = { Accept: 'text/markdown' }
    const jinaKey = process.env.JINA_API_KEY
    if (jinaKey) {
        headers.Authorization = `Bearer ${jinaKey}`
    }

    const response = await proxyFetch(jinaUrl, {
        headers,
        signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
        throw new Error(`Jina Reader failed: ${response.status}`)
    }

    const markdown = await response.text()
    const truncated = markdown.length > PAGE_CONTENT_MAX_CHARS
    const content = truncated
        ? markdown.slice(0, PAGE_CONTENT_MAX_CHARS)
        : markdown

    return {
        content,
        bytesFetched: new Blob([markdown]).size,
        truncated,
        source: 'jina',
    }
}

async function defaultReadPage(url: string): Promise<PageContent> {
    const direct = await fetchDirect(url)
    if (direct) return direct
    return fetchJina(url)
}

// ─── summarize ───

function createSummarize(): ResearchDeps['summarize'] {
    return async (content: string, question: string): Promise<string> => {
        const prompt = WEB_FETCH_SUMMARY_PROMPT.replace(
            '{content}',
            content,
        ).replace('{question}', question)
        const result = await generateText({
            model: getModel('light'),
            prompt,
        })
        return result.text
    }
}

// ─── Factory ───

export function createDefaultResearchDeps(): ResearchDeps {
    const tavilyKey = process.env.TAVILY_API_KEY

    return {
        searchWeb: async (query: string, options?: SearchOptions) => {
            if (!tavilyKey) {
                throw new Error('TAVILY_API_KEY is not configured')
            }
            const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
            const client = tavily({
                apiKey: tavilyKey,
                ...(proxyUrl
                    ? { proxies: { http: proxyUrl, https: proxyUrl } }
                    : {}),
            })
            const response = await client.search(query, {
                topic: options?.topic ?? 'general',
                maxResults: options?.maxResults ?? 5,
                ...(options?.timeRange ? { timeRange: options.timeRange } : {}),
            })
            return {
                results: (response.results ?? []).map(
                    (r: {
                        title?: string
                        url?: string
                        content?: string
                        score?: number
                        publishedDate?: string
                    }) => ({
                        title: r.title ?? '',
                        url: r.url ?? '',
                        content: r.content ?? '',
                        score: r.score ?? 0,
                        ...(r.publishedDate
                            ? { publishedDate: r.publishedDate }
                            : {}),
                    }),
                ),
            }
        },
        generateText,
        searchModel: getModel('search'),
        readPage: defaultReadPage,
        summarize: createSummarize(),
    }
}

// ─── Convenience ───

export function createResearchTools(deps?: ResearchDeps) {
    const resolvedDeps = deps ?? createDefaultResearchDeps()
    return {
        webSearch: createWebSearchTool(resolvedDeps),
        webFetch: createWebFetchTool(resolvedDeps),
        searchX: createSearchXTool(),
    }
}
