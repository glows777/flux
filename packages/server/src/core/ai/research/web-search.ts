import { tool, stepCountIs } from 'ai'
import { z } from 'zod'
import type { ResearchDeps, SearchResponse } from './types'
import {
  RESEARCH_TIMEOUTS,
  WEB_SEARCH_MAX_STEPS,
  WEB_SEARCH_SYSTEM_PROMPT,
} from './types'

export function createSearchTavilyTool(
  deps: Pick<ResearchDeps, 'searchWeb'>
) {
  return tool({
    description:
      '搜索互联网获取实时信息。支持 general/news/finance 三种搜索类型，可限定时间范围。',
    inputSchema: z.object({
      query: z.string(),
      topic: z
        .enum(['general', 'news', 'finance'])
        .default('finance'),
      timeRange: z.enum(['day', 'week', 'month', 'year']).optional(),
      maxResults: z.number().min(1).max(10).default(5),
    }),
    execute: async ({ query, topic = 'finance', timeRange, maxResults = 5 }) => {
      try {
        const options: Record<string, unknown> = { topic, maxResults }
        if (timeRange) {
          options.timeRange = timeRange
        }
        const response = await deps.searchWeb(query, options as Parameters<ResearchDeps['searchWeb']>[1])
        return response
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  })
}

interface StepToolResult {
  toolName: string
  output: unknown
}

interface GenerateTextStep {
  toolResults?: StepToolResult[]
}

interface GenerateTextResult {
  text: string
  steps: GenerateTextStep[]
}

export function createWebSearchTool(
  deps: Pick<ResearchDeps, 'searchWeb' | 'generateText' | 'searchModel'>
) {
  return tool({
    description:
      '搜索互联网。会自动多轮搜索、优化关键词、综合结果，返回报告和来源 URL（含相关性 score）。',
    inputSchema: z.object({
      query: z.string(),
    }),
    execute: async ({ query }, { abortSignal }) => {
      try {
        const combinedSignal = AbortSignal.any([
          ...(abortSignal ? [abortSignal] : []),
          AbortSignal.timeout(RESEARCH_TIMEOUTS.webSearch),
        ])

        const result = (await deps.generateText({
          model: deps.searchModel,
          system: WEB_SEARCH_SYSTEM_PROMPT,
          prompt: query,
          tools: {
            searchTavily: createSearchTavilyTool(deps),
          },
          stopWhen: stepCountIs(WEB_SEARCH_MAX_STEPS),
          abortSignal: combinedSignal,
        } as Parameters<typeof deps.generateText>[0])) as unknown as GenerateTextResult

        const sources = extractSources(result.steps)

        return { report: result.text, sources }
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error)
        if (
          msg.includes('aborted') ||
          msg.includes('AbortError') ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return { error: 'webSearch timed out' }
        }
        return { error: msg }
      }
    },
  })
}

function extractSources(
  steps: GenerateTextStep[]
): Array<{ title: string; url: string; score: number }> {
  const allResults = steps
    .flatMap((step) => step.toolResults ?? [])
    .filter((r) => r.toolName === 'searchTavily')
    .flatMap((r) => {
      const output = r.output as SearchResponse | undefined
      return output?.results ?? []
    })
    .map((r) => ({ title: r.title, url: r.url, score: r.score }))

  const byUrl = new Map<
    string,
    { title: string; url: string; score: number }
  >()
  for (const item of allResults) {
    const existing = byUrl.get(item.url)
    if (!existing || item.score > existing.score) {
      byUrl.set(item.url, item)
    }
  }

  return [...byUrl.values()].sort((a, b) => b.score - a.score)
}
