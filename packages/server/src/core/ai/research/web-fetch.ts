import { tool } from 'ai'
import { z } from 'zod'
import type { ResearchDeps, PageContent, WebFetchResult } from './types'
import {
  PAGE_CONTENT_MAX_CHARS,
  FETCH_CACHE_TTL,
  FETCH_CACHE_MAX_SIZE,
  RESEARCH_TIMEOUTS,
  isPublicUrl,
} from './types'

interface CacheEntry {
  result: PageContent
  expireAt: number
}

const fetchCache = new Map<string, CacheEntry>()

export function clearFetchCache(): void {
  fetchCache.clear()
}

export function getFetchCacheSize(): number {
  return fetchCache.size
}

function getCached(url: string): PageContent | null {
  const entry = fetchCache.get(url)
  if (!entry) return null
  if (Date.now() > entry.expireAt) {
    fetchCache.delete(url)
    return null
  }
  // LRU refresh: delete and re-set to move to end
  fetchCache.delete(url)
  fetchCache.set(url, entry)
  return entry.result
}

function setCache(url: string, result: PageContent): void {
  // LRU eviction
  if (fetchCache.size >= FETCH_CACHE_MAX_SIZE) {
    const oldestKey = fetchCache.keys().next().value
    if (oldestKey !== undefined) {
      fetchCache.delete(oldestKey)
    }
  }
  fetchCache.set(url, { result, expireAt: Date.now() + FETCH_CACHE_TTL })
}

export function createWebFetchTool(
  deps: Pick<ResearchDeps, 'readPage' | 'summarize'>
) {
  return tool({
    description:
      '读取并摘要网页内容。当搜索报告中某个来源需要更详细的信息时使用。',
    inputSchema: z.object({
      url: z
        .string()
        .url()
        .refine((u) => isPublicUrl(u), 'Only public HTTP/HTTPS URLs are allowed'),
      question: z.string(),
    }),
    execute: async ({ url, question }): Promise<WebFetchResult> => {
      try {
        // Try cache first
        let pageContent = getCached(url)

        if (!pageContent) {
          pageContent = await deps.readPage(url)
          setCache(url, pageContent)
        }

        // Truncate if needed (character-level)
        const needsTruncation =
          pageContent.content.length > PAGE_CONTENT_MAX_CHARS
        const truncatedContent = needsTruncation
          ? pageContent.content.slice(0, PAGE_CONTENT_MAX_CHARS)
          : pageContent.content
        const truncated = needsTruncation || pageContent.truncated

        // Try to summarize
        try {
          const summary = await deps.summarize(truncatedContent, question)
          return {
            url,
            summary,
            bytesFetched: pageContent.bytesFetched,
            truncated,
            source: pageContent.source,
          }
        } catch {
          // Summarize failed — return fallback with raw content
          return {
            url,
            content: truncatedContent,
            bytesFetched: pageContent.bytesFetched,
            truncated,
            source: pageContent.source,
          }
        }
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error)
        if (
          msg.includes('aborted') ||
          msg.includes('AbortError') ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return { error: 'webFetch timed out' }
        }
        return { error: msg }
      }
    },
  })
}
