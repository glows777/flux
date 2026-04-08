import { prisma } from '@/core/db'
import type { PrismaClient } from '@prisma/client'
import { VALID_SLOTS, SLOT_LIMITS, type MemorySlot, type MemoryVersionEntry } from './types'

// ─── Error ───

export class SlotContentTooLongError extends Error {
  constructor(
    readonly slot: MemorySlot,
    readonly actual: number,
    readonly limit: number,
  ) {
    super(`Slot "${slot}" content too long: ${actual} chars, limit is ${limit}`)
    this.name = 'SlotContentTooLongError'
  }
}

// ─── Store Deps (for testing) ───

export interface StoreDeps {
  readonly db: PrismaClient
}

function getDefaultDeps(): StoreDeps {
  return { db: prisma }
}

// ─── Functions ───

export async function getSlotContent(
  slot: MemorySlot,
  deps?: StoreDeps,
): Promise<string | null> {
  const { db } = deps ?? getDefaultDeps()
  const row = await db.memoryVersion.findFirst({
    where: { slot },
    orderBy: { createdAt: 'desc' },
    select: { content: true },
  })
  return row?.content ?? null
}

export async function writeSlot(
  slot: MemorySlot,
  content: string,
  author: string,
  reason?: string,
  deps?: StoreDeps,
): Promise<void> {
  const limit = SLOT_LIMITS[slot]
  if (content.length > limit) {
    throw new SlotContentTooLongError(slot, content.length, limit)
  }
  const { db } = deps ?? getDefaultDeps()
  await db.memoryVersion.create({
    data: { slot, content, author, reason: reason ?? null },
  })
}

export async function getSlotHistory(
  slot: MemorySlot,
  limit = 10,
  deps?: StoreDeps,
): Promise<MemoryVersionEntry[]> {
  const { db } = deps ?? getDefaultDeps()
  const rows = await db.memoryVersion.findMany({
    where: { slot },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map((r) => ({
    id: r.id,
    slot: r.slot,
    content: r.content,
    author: r.author,
    reason: r.reason,
    createdAt: r.createdAt,
  }))
}
