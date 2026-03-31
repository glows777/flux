import { beforeEach, describe, expect, it, mock } from 'bun:test'

// ─── Mock store + search modules ───

const mockReadDocument = mock(() => Promise.resolve('# Profile' as string | null))
const mockWriteDocument = mock(() => Promise.resolve())
const mockAppendDocument = mock(() => Promise.resolve())
const mockListDocuments = mock(() =>
  Promise.resolve([
    { id: '1', path: 'profile.md', evergreen: true, updatedAt: new Date('2026-01-15T00:00:00.000Z') },
  ]),
)
const mockSearchMemory = mock(() =>
  Promise.resolve([
    {
      id: '1',
      content: 'test content',
      docPath: 'profile.md',
      score: 0.9,
      entities: ['AAPL'],
      docId: 'd1',
      lineStart: 1,
      lineEnd: 5,
      evergreen: true,
      updatedAt: new Date('2026-01-15T00:00:00.000Z'),
    },
  ]),
)

mock.module('@/core/ai/memory/store', () => ({
  readDocument: mockReadDocument,
  writeDocument: mockWriteDocument,
  appendDocument: mockAppendDocument,
  listDocuments: mockListDocuments,
}))

mock.module('@/core/ai/memory/search', () => ({
  searchMemory: mockSearchMemory,
}))

import { createMemoryTools, MEMORY_TOOL_TIMEOUTS } from '@/core/ai/memory/tools'
import type { MemoryDeps } from '@/core/ai/memory/types'

// ─── Setup ───

const fakeDeps = { db: {} } as unknown as MemoryDeps

let tools: ReturnType<typeof createMemoryTools>

beforeEach(() => {
  mockReadDocument.mockClear()
  mockWriteDocument.mockClear()
  mockAppendDocument.mockClear()
  mockListDocuments.mockClear()
  mockSearchMemory.mockClear()

  mockReadDocument.mockImplementation(() => Promise.resolve('# Profile'))
  mockListDocuments.mockImplementation(() =>
    Promise.resolve([
      { id: '1', path: 'profile.md', evergreen: true, updatedAt: new Date('2026-01-15T00:00:00.000Z') },
    ]),
  )
  mockSearchMemory.mockImplementation(() =>
    Promise.resolve([
      {
        id: '1',
        content: 'test content',
        docPath: 'profile.md',
        score: 0.9,
        entities: ['AAPL'],
        docId: 'd1',
        lineStart: 1,
        lineEnd: 5,
        evergreen: true,
        updatedAt: new Date('2026-01-15T00:00:00.000Z'),
      },
    ]),
  )

  tools = createMemoryTools(fakeDeps)
})

// ─── memory_read ───

describe('memory_read', () => {
  it('returns found:true with content when document exists', async () => {
    mockReadDocument.mockResolvedValueOnce('# Profile')

    const result = await tools.memory_read.execute({ path: 'profile.md' }, { toolCallId: 'tc1', messages: [], abortSignal: undefined as any })

    expect(result).toEqual({ found: true, path: 'profile.md', content: '# Profile' })
    expect(mockReadDocument).toHaveBeenCalledWith('profile.md', fakeDeps)
  })

  it('returns found:false when document does not exist', async () => {
    mockReadDocument.mockResolvedValueOnce(null)

    const result = await tools.memory_read.execute({ path: 'missing.md' }, { toolCallId: 'tc1', messages: [], abortSignal: undefined as any })

    expect(result).toEqual({ found: false, message: '文档 missing.md 不存在' })
  })
})

// ─── memory_write ───

describe('memory_write', () => {
  it('calls writeDocument and returns success', async () => {
    const result = await tools.memory_write.execute(
      { path: 'profile.md', content: '# New' },
      { toolCallId: 'tc1', messages: [], abortSignal: undefined as any },
    )

    expect(result).toEqual({ success: true, path: 'profile.md', message: '已更新 profile.md' })
    expect(mockWriteDocument).toHaveBeenCalledWith('profile.md', '# New', fakeDeps)
  })
})

// ─── memory_append ───

describe('memory_append', () => {
  it('calls appendDocument and returns success', async () => {
    const result = await tools.memory_append.execute(
      { path: 'opinions/AAPL.md', entry: '看好' },
      { toolCallId: 'tc1', messages: [], abortSignal: undefined as any },
    )

    expect(result).toEqual({ success: true, path: 'opinions/AAPL.md', message: '已追加到 opinions/AAPL.md' })
    expect(mockAppendDocument).toHaveBeenCalledWith('opinions/AAPL.md', '看好', fakeDeps)
  })
})

// ─── memory_search ───

describe('memory_search', () => {
  it('calls searchMemory and returns truncated results', async () => {
    const result = await tools.memory_search.execute(
      { query: 'AAPL', symbol: 'AAPL', limit: 5 },
      { toolCallId: 'tc1', messages: [], abortSignal: undefined as any },
    )

    expect(mockSearchMemory).toHaveBeenCalledWith('AAPL', fakeDeps, { symbol: 'AAPL', limit: 5 })
    expect(result).toEqual({
      results: [
        {
          docPath: 'profile.md',
          content: 'test content',
          score: 0.9,
          entities: ['AAPL'],
        },
      ],
    })
  })

  it('truncates content to 500 chars', async () => {
    const longContent = 'x'.repeat(600)
    mockSearchMemory.mockResolvedValueOnce([
      {
        id: '1',
        content: longContent,
        docPath: 'profile.md',
        score: 0.85,
        entities: [],
        docId: 'd1',
        lineStart: 1,
        lineEnd: 5,
        evergreen: true,
        updatedAt: new Date(),
      },
    ])

    const result = await tools.memory_search.execute(
      { query: 'test', limit: 5 },
      { toolCallId: 'tc1', messages: [], abortSignal: undefined as any },
    )

    expect(result.results[0].content).toHaveLength(500)
  })

  it('rounds score to 2 decimal places', async () => {
    mockSearchMemory.mockResolvedValueOnce([
      {
        id: '1',
        content: 'test',
        docPath: 'profile.md',
        score: 0.87654321,
        entities: [],
        docId: 'd1',
        lineStart: 1,
        lineEnd: 5,
        evergreen: true,
        updatedAt: new Date(),
      },
    ])

    const result = await tools.memory_search.execute(
      { query: 'test', limit: 5 },
      { toolCallId: 'tc1', messages: [], abortSignal: undefined as any },
    )

    expect(result.results[0].score).toBe(0.88)
  })
})

// ─── memory_list ───

describe('memory_list', () => {
  it('calls listDocuments and returns documents with ISO string dates', async () => {
    const result = await tools.memory_list.execute(
      {},
      { toolCallId: 'tc1', messages: [], abortSignal: undefined as any },
    )

    expect(mockListDocuments).toHaveBeenCalledWith(fakeDeps)
    expect(result).toEqual({
      documents: [
        {
          path: 'profile.md',
          evergreen: true,
          updatedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
    })
  })
})

// ─── Zod Schema Validation ───

describe('inputSchema validation', () => {
  it('memory_read accepts valid input', () => {
    const result = tools.memory_read.inputSchema.safeParse({ path: 'profile.md' })
    expect(result.success).toBe(true)
  })

  it('memory_write accepts valid input', () => {
    const result = tools.memory_write.inputSchema.safeParse({ path: 'profile.md', content: '# New' })
    expect(result.success).toBe(true)
  })

  it('memory_append accepts valid input', () => {
    const result = tools.memory_append.inputSchema.safeParse({ path: 'opinions/AAPL.md', entry: '看好' })
    expect(result.success).toBe(true)
  })

  it('memory_search accepts valid input with optional fields', () => {
    const result = tools.memory_search.inputSchema.safeParse({ query: 'AAPL', symbol: 'AAPL', limit: 5 })
    expect(result.success).toBe(true)
  })

  it('memory_search accepts query-only input', () => {
    const result = tools.memory_search.inputSchema.safeParse({ query: 'test' })
    expect(result.success).toBe(true)
  })

  it('memory_list accepts empty input', () => {
    const result = tools.memory_list.inputSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

// ─── Timeout Config ───

describe('MEMORY_TOOL_TIMEOUTS', () => {
  it('has correct timeout values', () => {
    expect(MEMORY_TOOL_TIMEOUTS).toEqual({
      memory_read: 5_000,
      memory_write: 5_000,
      memory_append: 5_000,
      memory_search: 8_000,
      memory_list: 5_000,
    })
  })
})
