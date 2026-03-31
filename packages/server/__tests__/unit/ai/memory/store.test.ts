import { beforeEach, describe, expect, it, mock } from 'bun:test'

import {
  appendDocument,
  appendTranscript,
  deleteDocument,
  findRecentTranscript,
  listDocuments,
  readDocument,
  reindexDocument,
  writeDocument,
} from '@/core/ai/memory/store'

// ─── Reindex Function Mocks (passed via DI, no mock.module) ───

const mockChunkDocument = mock(() => [] as any[])
const mockGenerateEmbedding = mock(() => Promise.resolve([0.1]))
const mockDeleteChunksByDocId = mock(() => Promise.resolve())
const mockUpsertChunkWithEmbedding = mock(() => Promise.resolve())

// ─── Mock DB ───

function createMockDb() {
  return {
    memoryDocument: {
      findUnique: mock(() => Promise.resolve(null)),
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      create: mock(() => Promise.resolve({ id: 'new-doc-id' })),
      update: mock(() => Promise.resolve({ id: 'existing-doc-id' })),
      delete: mock(() => Promise.resolve()),
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
    },
  } as any
}

function createDeps(db: ReturnType<typeof createMockDb>) {
  return {
    db,
    chunkDocument: mockChunkDocument,
    generateEmbedding: mockGenerateEmbedding,
    deleteChunksByDocId: mockDeleteChunksByDocId,
    upsertChunkWithEmbedding: mockUpsertChunkWithEmbedding,
  }
}

let mockDb: ReturnType<typeof createMockDb>
let deps: ReturnType<typeof createDeps>

beforeEach(() => {
  mockDb = createMockDb()
  deps = createDeps(mockDb)
  mockChunkDocument.mockClear()
  mockGenerateEmbedding.mockClear()
  mockDeleteChunksByDocId.mockClear()
  mockUpsertChunkWithEmbedding.mockClear()
})

// ─── readDocument ───

describe('readDocument', () => {
  it('returns content when document exists', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce({
      content: '# Hello',
    })

    const result = await readDocument('test.md', deps)

    expect(result).toBe('# Hello')
    expect(mockDb.memoryDocument.findUnique).toHaveBeenCalledWith({
      where: { path: 'test.md' },
    })
  })

  it('returns null when document does not exist', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce(null)

    const result = await readDocument('missing.md', deps)

    expect(result).toBeNull()
  })
})

// ─── listDocuments ───

describe('listDocuments', () => {
  it('returns document info array', async () => {
    const docs = [
      {
        id: '1',
        path: 'profile.md',
        evergreen: true,
        updatedAt: new Date('2026-01-01'),
      },
    ]
    mockDb.memoryDocument.findMany.mockResolvedValueOnce(docs)

    const result = await listDocuments(deps)

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('profile.md')
    expect(mockDb.memoryDocument.findMany).toHaveBeenCalledWith({
      select: { id: true, path: true, evergreen: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    })
  })
})

// ─── writeDocument ───

describe('writeDocument', () => {
  it('creates new document when not exists', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce(null)

    await writeDocument('new.md', '# New', deps)

    expect(mockDb.memoryDocument.create).toHaveBeenCalled()
    const createCall = mockDb.memoryDocument.create.mock.calls[0][0]
    expect(createCall.data.path).toBe('new.md')
    expect(createCall.data.content).toBe('# New')
  })

  it('updates existing document', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce({ id: 'doc-1' })

    await writeDocument('test.md', '# Updated', deps)

    expect(mockDb.memoryDocument.update).toHaveBeenCalled()
    const updateCall = mockDb.memoryDocument.update.mock.calls[0][0]
    expect(updateCall.where.id).toBe('doc-1')
    expect(updateCall.data.content).toBe('# Updated')
  })

  it('sets evergreen=true for profile.md', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce(null)

    await writeDocument('profile.md', '# Profile', deps)

    const createCall = mockDb.memoryDocument.create.mock.calls[0][0]
    expect(createCall.data.evergreen).toBe(true)
  })

  it('sets evergreen=false for non-evergreen paths', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce(null)

    await writeDocument('opinions/AAPL.md', '# AAPL', deps)

    const createCall = mockDb.memoryDocument.create.mock.calls[0][0]
    expect(createCall.data.evergreen).toBe(false)
  })

  it('triggers async reindex (fire-and-forget)', async () => {
    mockDb.memoryDocument.findUnique
      .mockResolvedValueOnce(null)
      // reindexDocument reads the doc internally
      .mockResolvedValueOnce({ id: 'new-doc-id', content: '# New' })
    mockDb.memoryDocument.create.mockResolvedValueOnce({ id: 'new-doc-id' })
    mockChunkDocument.mockReturnValueOnce([
      { content: '# New', lineStart: 1, lineEnd: 1, entities: [] },
    ])

    await writeDocument('opinions/AAPL.md', '# New', deps)

    // Wait for fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 50))

    expect(mockDeleteChunksByDocId).toHaveBeenCalled()
    expect(mockChunkDocument).toHaveBeenCalled()
  })
})

// ─── appendDocument ───

describe('appendDocument', () => {
  it('appends to existing document with timestamp', async () => {
    // readDocument call inside appendDocument
    mockDb.memoryDocument.findUnique
      .mockResolvedValueOnce({ content: '旧内容' })
      // writeDocument's findUnique
      .mockResolvedValueOnce({ id: 'doc-1' })

    await appendDocument('opinions/AAPL.md', '看好服务', deps)

    expect(mockDb.memoryDocument.update).toHaveBeenCalled()
    const updateCall = mockDb.memoryDocument.update.mock.calls[0][0]
    expect(updateCall.data.content).toContain('旧内容')
    expect(updateCall.data.content).toContain('看好服务')
    // Should contain a date timestamp like [2026-03-08]
    expect(updateCall.data.content).toMatch(/\[\d{4}-\d{2}-\d{2}\]/)
  })

  it('creates new document when not exists', async () => {
    mockDb.memoryDocument.findUnique
      .mockResolvedValueOnce(null) // readDocument returns null
      .mockResolvedValueOnce(null) // writeDocument's findUnique

    await appendDocument('new.md', '新内容', deps)

    expect(mockDb.memoryDocument.create).toHaveBeenCalled()
    const createCall = mockDb.memoryDocument.create.mock.calls[0][0]
    expect(createCall.data.content).toContain('新内容')
    expect(createCall.data.content).toMatch(/\[\d{4}-\d{2}-\d{2}\]/)
  })
})

// ─── appendTranscript ───

describe('appendTranscript', () => {
  it('creates new transcript document with title', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce(null)
    mockDb.memoryDocument.create.mockResolvedValueOnce({
      id: 'transcript-doc-id',
    })

    const docId = await appendTranscript(
      'session-abc',
      '## 14:32\n**User**: 分析 NVDA\n...',
      'NVDA',
      deps,
    )

    expect(mockDb.memoryDocument.create).toHaveBeenCalled()
    const createCall = mockDb.memoryDocument.create.mock.calls[0][0]
    expect(createCall.data.content).toContain('NVDA 对话')
    expect(createCall.data.content).toContain('## 14:32')
    expect(createCall.data.evergreen).toBe(false)
    expect(docId).toBe('transcript-doc-id')
    // Should NOT trigger reindex
    expect(mockChunkDocument).not.toHaveBeenCalled()
  })

  it('appends to existing transcript', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce({
      id: 'existing-transcript',
      content: '# 2026-03-08 NVDA 对话\n\n## 14:32\n旧内容',
    })
    mockDb.memoryDocument.update.mockResolvedValueOnce({
      id: 'existing-transcript',
    })

    const docId = await appendTranscript(
      'session-abc',
      '## 14:35\n**User**: 继续\n...',
      'NVDA',
      deps,
    )

    expect(mockDb.memoryDocument.update).toHaveBeenCalled()
    const updateCall = mockDb.memoryDocument.update.mock.calls[0][0]
    expect(updateCall.data.content).toContain('## 14:35')
    expect(updateCall.data.content).toContain('旧内容')
    expect(docId).toBe('existing-transcript')
    // Should NOT trigger reindex
    expect(mockChunkDocument).not.toHaveBeenCalled()
  })

  it('creates transcript with 通用 label when symbol is omitted', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce(null)
    mockDb.memoryDocument.create.mockResolvedValueOnce({
      id: 'general-transcript-id',
    })

    const docId = await appendTranscript(
      'session-general',
      '## 10:00\n**User**: 你好\n...',
      undefined,
      deps,
    )

    expect(mockDb.memoryDocument.create).toHaveBeenCalled()
    const createCall = mockDb.memoryDocument.create.mock.calls[0][0]
    expect(createCall.data.content).toContain('通用 对话')
    expect(createCall.data.content).toContain('## 10:00')
    expect(createCall.data.evergreen).toBe(false)
    expect(docId).toBe('general-transcript-id')
  })
})

// ─── reindexDocument ───

describe('reindexDocument', () => {
  it('executes full reindex pipeline', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce({
      id: 'doc-1',
      content: '# Test content',
    })
    mockChunkDocument.mockReturnValueOnce([
      { content: '# Test content', lineStart: 1, lineEnd: 1, entities: ['TEST'] },
    ])
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3])

    await reindexDocument('doc-1', deps)

    expect(mockDeleteChunksByDocId).toHaveBeenCalledWith(mockDb, 'doc-1')
    expect(mockChunkDocument).toHaveBeenCalledWith('# Test content')
    expect(mockGenerateEmbedding).toHaveBeenCalledWith('# Test content')
    expect(mockUpsertChunkWithEmbedding).toHaveBeenCalled()
    const upsertCall = mockUpsertChunkWithEmbedding.mock.calls[0]
    expect(upsertCall[1].id).toBe('doc-1-1')
    expect(upsertCall[1].docId).toBe('doc-1')
    expect(upsertCall[2]).toEqual([0.1, 0.2, 0.3])
  })

  it('silently returns when document does not exist', async () => {
    mockDb.memoryDocument.findUnique.mockResolvedValueOnce(null)

    await reindexDocument('deleted-doc', deps)

    expect(mockChunkDocument).not.toHaveBeenCalled()
    expect(mockGenerateEmbedding).not.toHaveBeenCalled()
  })
})

// ─── deleteDocument ───

describe('deleteDocument', () => {
  it('calls deleteMany for existing document', async () => {
    mockDb.memoryDocument.deleteMany.mockResolvedValueOnce({ count: 1 })

    await deleteDocument('test.md', deps)

    expect(mockDb.memoryDocument.deleteMany).toHaveBeenCalledWith({
      where: { path: 'test.md' },
    })
  })

  it('does not throw when document does not exist', async () => {
    mockDb.memoryDocument.deleteMany.mockResolvedValueOnce({ count: 0 })

    await expect(
      deleteDocument('not-exist.md', deps),
    ).resolves.toBeUndefined()
  })
})

// ─── findRecentTranscript ───

describe('findRecentTranscript', () => {
  it('returns matching transcript with symbol in title', async () => {
    mockDb.memoryDocument.findFirst.mockResolvedValueOnce({
      path: 'log/2026-03-08-session-abc.md',
      content: '# 2026-03-08 NVDA 对话\n\n## 14:32\n...',
    })

    const result = await findRecentTranscript('NVDA', deps)

    expect(result).toEqual({
      path: 'log/2026-03-08-session-abc.md',
      content: '# 2026-03-08 NVDA 对话\n\n## 14:32\n...',
    })
    const findCall = mockDb.memoryDocument.findFirst.mock.calls[0][0]
    expect(findCall.where.path.startsWith).toBe('log/')
    expect(findCall.where.content.contains).toBe('NVDA 对话')
    expect(findCall.orderBy.updatedAt).toBe('desc')
  })

  it('returns null when no matching transcript', async () => {
    mockDb.memoryDocument.findFirst.mockResolvedValueOnce(null)

    const result = await findRecentTranscript('TSLA', deps)

    expect(result).toBeNull()
  })

  it('returns matching transcript for general chat when symbol is null', async () => {
    mockDb.memoryDocument.findFirst.mockResolvedValueOnce({
      path: 'log/2026-03-17-session-xyz.md',
      content: '# 2026-03-17 通用 对话\n\n## 10:00\n...',
    })

    const result = await findRecentTranscript(null, deps)

    expect(result).toEqual({
      path: 'log/2026-03-17-session-xyz.md',
      content: '# 2026-03-17 通用 对话\n\n## 10:00\n...',
    })
    const findCall = mockDb.memoryDocument.findFirst.mock.calls[0][0]
    expect(findCall.where.content.contains).toBe('通用 对话')
  })
})
