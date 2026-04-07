import { tool } from 'ai'
import { z } from 'zod'
import { getSlotContent, writeSlot, getSlotHistory, SlotContentTooLongError } from './store'
import { VALID_SLOTS, type MemorySlot } from './types'
import type { StoreDeps } from './store'
import { withTimeout } from '../timeout'

const SLOT_ENUM = z.enum(VALID_SLOTS as [MemorySlot, ...MemorySlot[]])

const TOOL_TIMEOUTS = {
  update_core_memory: 5_000,
  save_lesson: 5_000,
  read_history: 5_000,
} as const

export function createMemoryTools(deps?: StoreDeps) {
  return {
    update_core_memory: tool({
      description:
        '更新指定 memory slot 的内容。写入后将成为该 slot 的最新状态，旧版本自动保留于历史记录。内容超出长度上限时会返回错误，需先精简内容再重试。',
      inputSchema: z.object({
        slot: SLOT_ENUM,
        content: z.string(),
        reason: z.string().optional(),
      }),
      execute: async ({ slot, content, reason }) => {
        try {
          await withTimeout(
            writeSlot(slot, content, 'agent', reason, deps),
            TOOL_TIMEOUTS.update_core_memory,
            'update_core_memory',
          )
          return { success: true as const, slot, message: `已更新 ${slot}` }
        } catch (e) {
          if (e instanceof SlotContentTooLongError) {
            return {
              success: false as const,
              error: `内容过长（${e.actual} 字符，上限 ${e.limit}）。请精简内容后重试。`,
            }
          }
          throw e
        }
      },
    }),

    save_lesson: tool({
      description:
        '向 lessons slot 追加一条交易教训或行为规则。自动添加日期时间戳，纯追加不去重。内容超出 lessons 总长度上限时返回错误。',
      inputSchema: z.object({
        lesson: z.string(),
      }),
      execute: async ({ lesson }) => {
        const date = new Date().toISOString().slice(0, 10)
        const existing = await withTimeout(
          getSlotContent('lessons', deps),
          TOOL_TIMEOUTS.save_lesson,
          'save_lesson',
        )
        const newContent = existing
          ? `${existing}\n[${date}] ${lesson}`
          : `[${date}] ${lesson}`
        try {
          await withTimeout(
            writeSlot('lessons', newContent, 'agent', undefined, deps),
            TOOL_TIMEOUTS.save_lesson,
            'save_lesson',
          )
          return { success: true as const, message: '教训已追加到 lessons slot' }
        } catch (e) {
          if (e instanceof SlotContentTooLongError) {
            return {
              success: false as const,
              error: `lessons 内容已达上限（${e.actual}/${e.limit}）。请先用 update_core_memory 精简 lessons 内容，再追加新教训。`,
            }
          }
          throw e
        }
      },
    }),
  }
}

export function createHistoryTool(deps?: StoreDeps) {
  return {
    read_history: tool({
      description:
        '读取指定 slot 的版本历史，用于回顾历史决策变化。返回按时间倒序排列的版本列表。',
      inputSchema: z.object({
        slot: SLOT_ENUM,
        limit: z.number().int().min(1).max(20).optional().default(5),
      }),
      execute: async ({ slot, limit }) => {
        const history = await withTimeout(
          getSlotHistory(slot, limit, deps),
          TOOL_TIMEOUTS.read_history,
          'read_history',
        )
        return {
          slot,
          versions: history.map((v) => ({
            id: v.id,
            author: v.author,
            reason: v.reason,
            createdAt: v.createdAt.toISOString(),
            content: v.content,
          })),
        }
      },
    }),
  }
}
