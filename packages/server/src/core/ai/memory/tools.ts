import { tool } from 'ai'
import { z } from 'zod'
import { readDocument, writeDocument, appendDocument, listDocuments } from './store'
import { searchMemory } from './search'
import type { MemoryDeps } from './types'
import { withTimeout } from '../timeout'

export const MEMORY_TOOL_TIMEOUTS = {
  memory_read: 5_000,
  memory_write: 5_000,
  memory_append: 5_000,
  memory_search: 8_000,
  memory_list: 5_000,
} as const

export function createMemoryTools(deps?: MemoryDeps) {
  return {
    memory_read: tool({
      description:
        '读取指定记忆文档的完整内容。路径示例：profile.md, portfolio.md, opinions/AAPL.md',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const content = await withTimeout(
          readDocument(path, deps),
          MEMORY_TOOL_TIMEOUTS.memory_read,
          'memory_read',
        )
        if (content === null) {
          return { found: false as const, message: `文档 ${path} 不存在` }
        }
        return { found: true as const, path, content }
      },
    }),

    memory_write: tool({
      description:
        '覆写指定记忆文档的内容。用于更新常青文档（profile.md 等）。注意：portfolio.md 的"当前持仓"区域由系统自动同步，请勿覆写。',
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => {
        await withTimeout(
          writeDocument(path, content, deps),
          MEMORY_TOOL_TIMEOUTS.memory_write,
          'memory_write',
        )
        return { success: true as const, path, message: `已更新 ${path}` }
      },
    }),

    memory_append: tool({
      description:
        '向文档末尾追加内容，自动添加日期时间戳。适用于 opinions/、decisions/、log/ 等追加式文档。',
      inputSchema: z.object({ path: z.string(), entry: z.string() }),
      execute: async ({ path, entry }) => {
        await withTimeout(
          appendDocument(path, entry, deps),
          MEMORY_TOOL_TIMEOUTS.memory_append,
          'memory_append',
        )
        return { success: true as const, path, message: `已追加到 ${path}` }
      },
    }),

    memory_search: tool({
      description:
        '搜索记忆文档，返回最相关的内容片段。使用语义搜索 + 关键词匹配 + 实体关联三重信号。',
      inputSchema: z.object({
        query: z.string(),
        symbol: z.string().optional(),
        limit: z.number().optional().default(5),
      }),
      execute: async ({ query, symbol, limit }) => {
        const raw = await withTimeout(
          searchMemory(query, deps, { symbol, limit }),
          MEMORY_TOOL_TIMEOUTS.memory_search,
          'memory_search',
        )
        return {
          results: raw.map((r) => ({
            docPath: r.docPath,
            content: r.content.slice(0, 500),
            score: Math.round(r.score * 100) / 100,
            entities: r.entities,
          })),
        }
      },
    }),

    memory_list: tool({
      description: '列出所有记忆文档的路径和更新时间。',
      inputSchema: z.object({}),
      execute: async () => {
        const docs = await withTimeout(
          listDocuments(deps),
          MEMORY_TOOL_TIMEOUTS.memory_list,
          'memory_list',
        )
        return {
          documents: docs.map((d) => ({
            path: d.path,
            evergreen: d.evergreen,
            updatedAt: d.updatedAt.toISOString(),
          })),
        }
      },
    }),
  }
}
