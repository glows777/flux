import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  getSlotContent,
  writeSlot,
  getSlotHistory,
  SlotContentTooLongError,
} from '@/core/ai/memory/store'

// ─── Mock DB ───

function createMockDb() {
  return {
    memoryVersion: {
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      create: mock(() => Promise.resolve({ id: 'v1' })),
    },
  } as any
}

let mockDb: ReturnType<typeof createMockDb>

beforeEach(() => {
  mockDb = createMockDb()
})

// ─── getSlotContent ───

describe('getSlotContent', () => {
  it('returns content when slot has a version', async () => {
    mockDb.memoryVersion.findFirst.mockResolvedValueOnce({ content: '偏好成长股' })
    const result = await getSlotContent('user_profile', { db: mockDb })
    expect(result).toBe('偏好成长股')
    expect(mockDb.memoryVersion.findFirst).toHaveBeenCalledWith({
      where: { slot: 'user_profile' },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    })
  })

  it('returns null when slot has no version', async () => {
    mockDb.memoryVersion.findFirst.mockResolvedValueOnce(null)
    const result = await getSlotContent('market_views', { db: mockDb })
    expect(result).toBeNull()
  })
})

// ─── writeSlot ───

describe('writeSlot', () => {
  it('inserts a new MemoryVersion record', async () => {
    await writeSlot('user_profile', 'A'.repeat(100), 'agent', '更新偏好', { db: mockDb })
    expect(mockDb.memoryVersion.create).toHaveBeenCalledWith({
      data: { slot: 'user_profile', content: 'A'.repeat(100), author: 'agent', reason: '更新偏好' },
    })
  })

  it('inserts with reason=null when reason is omitted', async () => {
    await writeSlot('lessons', '不要追涨', 'agent', undefined, { db: mockDb })
    const call = mockDb.memoryVersion.create.mock.calls[0][0]
    expect(call.data.reason).toBeNull()
  })

  it('throws SlotContentTooLongError when content exceeds limit', async () => {
    const tooLong = 'A'.repeat(501) // user_profile limit is 500
    await expect(
      writeSlot('user_profile', tooLong, 'agent', undefined, { db: mockDb })
    ).rejects.toBeInstanceOf(SlotContentTooLongError)
    // DB should NOT be called
    expect(mockDb.memoryVersion.create).not.toHaveBeenCalled()
  })

  it('throws SlotContentTooLongError with correct slot and limit in message', async () => {
    const tooLong = 'B'.repeat(2001) // portfolio_thesis limit is 2000
    try {
      await writeSlot('portfolio_thesis', tooLong, 'agent', undefined, { db: mockDb })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(SlotContentTooLongError)
      const err = e as SlotContentTooLongError
      expect(err.slot).toBe('portfolio_thesis')
      expect(err.limit).toBe(2000)
      expect(err.actual).toBe(2001)
    }
  })

  it('accepts content exactly at the limit', async () => {
    const atLimit = 'C'.repeat(500) // user_profile limit is 500
    await writeSlot('user_profile', atLimit, 'user', undefined, { db: mockDb })
    expect(mockDb.memoryVersion.create).toHaveBeenCalled()
  })
})

// ─── getSlotHistory ───

describe('getSlotHistory', () => {
  it('returns history ordered by createdAt desc', async () => {
    const rows = [
      { id: 'v3', slot: 'lessons', content: '教训3', author: 'agent', reason: null, createdAt: new Date('2026-04-03') },
      { id: 'v2', slot: 'lessons', content: '教训2', author: 'agent', reason: null, createdAt: new Date('2026-04-02') },
      { id: 'v1', slot: 'lessons', content: '教训1', author: 'agent', reason: null, createdAt: new Date('2026-04-01') },
    ]
    mockDb.memoryVersion.findMany.mockResolvedValueOnce(rows)
    const result = await getSlotHistory('lessons', 3, { db: mockDb })
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('v3')
    expect(result[2].id).toBe('v1')
    expect(mockDb.memoryVersion.findMany).toHaveBeenCalledWith({
      where: { slot: 'lessons' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    })
  })

  it('returns empty array when no versions exist', async () => {
    mockDb.memoryVersion.findMany.mockResolvedValueOnce([])
    const result = await getSlotHistory('agent_strategy', 10, { db: mockDb })
    expect(result).toEqual([])
  })

  it('uses default limit of 10 when not specified', async () => {
    mockDb.memoryVersion.findMany.mockResolvedValueOnce([])
    await getSlotHistory('user_profile', undefined, { db: mockDb })
    const call = mockDb.memoryVersion.findMany.mock.calls[0][0]
    expect(call.take).toBe(10)
  })
})
