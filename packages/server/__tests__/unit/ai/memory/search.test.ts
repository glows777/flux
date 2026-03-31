import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { getDecayMultiplier, searchMemory } from '@/core/ai/memory/search'
import { SEARCH_DEFAULTS } from '@/core/ai/memory/types'
import type { ChunkSearchResult } from '@/core/ai/memory/types'

// ─── Mock Setup (DI, no mock.module) ───

const mockHybridSearch = mock(() => Promise.resolve([] as ChunkSearchResult[]))
const mockGenerateEmbedding = mock(() => Promise.resolve([0.1, 0.2, 0.3]))

function createMockDb() {
  return {} as any
}

function createDeps(db: ReturnType<typeof createMockDb>) {
  return {
    db,
    generateEmbedding: mockGenerateEmbedding,
    hybridSearchChunks: mockHybridSearch,
  }
}

let mockDb: ReturnType<typeof createMockDb>
let deps: ReturnType<typeof createDeps>

beforeEach(() => {
  mockDb = createMockDb()
  deps = createDeps(mockDb)
  mockHybridSearch.mockClear()
  mockGenerateEmbedding.mockClear()
})

// ─── Helper ───

function makeResult(
  overrides: Partial<ChunkSearchResult> = {},
): ChunkSearchResult {
  return {
    id: 'chunk-1',
    content: 'test content',
    docId: 'doc-1',
    docPath: 'opinions/AAPL.md',
    lineStart: 1,
    lineEnd: 5,
    entities: ['AAPL'],
    score: 0.8,
    evergreen: false,
    updatedAt: new Date(),
    ...overrides,
  }
}

// ─── getDecayMultiplier ───

describe('getDecayMultiplier', () => {
  it('returns ~0.5 for non-evergreen with half-life elapsed', () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000)
    const multiplier = getDecayMultiplier(
      'opinions/AAPL.md',
      false,
      ninetyDaysAgo,
    )

    expect(multiplier).toBeCloseTo(0.5, 1)
  })

  it('returns 1.0 for evergreen documents', () => {
    const multiplier = getDecayMultiplier('profile.md', true, new Date())

    expect(multiplier).toBe(1.0)
  })

  it('returns 1.0 when DECAY_CONFIG has no match (fallback)', () => {
    const multiplier = getDecayMultiplier(
      'unknown/file.md',
      false,
      new Date(),
    )

    expect(multiplier).toBe(1.0)
  })

  it('returns 1.0 when updatedAt is undefined (fallback)', () => {
    const multiplier = getDecayMultiplier(
      'opinions/AAPL.md',
      false,
      undefined,
    )

    expect(multiplier).toBe(1.0)
  })
})

// ─── searchMemory ───

describe('searchMemory', () => {
  it('applies decay to non-evergreen result (score ≈ 0.4)', async () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000)
    mockHybridSearch.mockResolvedValueOnce([
      makeResult({
        docPath: 'opinions/AAPL.md',
        score: 0.8,
        evergreen: false,
        updatedAt: ninetyDaysAgo,
      }),
    ])

    const results = await searchMemory('AAPL analysis', deps)

    expect(results).toHaveLength(1)
    expect(results[0].score).toBeCloseTo(0.4, 1)
  })

  it('does not decay evergreen result (score unchanged)', async () => {
    mockHybridSearch.mockResolvedValueOnce([
      makeResult({
        docPath: 'profile.md',
        score: 0.9,
        evergreen: true,
      }),
    ])

    const results = await searchMemory('profile', deps)

    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(0.9)
  })

  it('passes symbol to hybridSearchChunks', async () => {
    await searchMemory('AAPL analysis', deps, { symbol: 'AAPL' })

    const call = mockHybridSearch.mock.calls[0]
    expect(call[3]).toBe('AAPL')
  })

  it('sorts results by decayed score descending', async () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000)
    mockHybridSearch.mockResolvedValueOnce([
      makeResult({
        id: 'non-evergreen',
        docPath: 'opinions/AAPL.md',
        score: 0.8,
        evergreen: false,
        updatedAt: ninetyDaysAgo,
      }),
      makeResult({
        id: 'evergreen',
        docPath: 'profile.md',
        score: 0.5,
        evergreen: true,
      }),
    ])

    const results = await searchMemory('test', deps)

    // evergreen 0.5 > non-evergreen 0.8 * 0.5 = 0.4
    expect(results[0].score).toBe(0.5)
    expect(results[1].score).toBeCloseTo(0.4, 1)
  })

  it('returns empty array for empty results', async () => {
    mockHybridSearch.mockResolvedValueOnce([])

    const results = await searchMemory('nothing', deps)

    expect(results).toEqual([])
  })

  it('uses DEFAULT_LIMIT when limit not provided', async () => {
    await searchMemory('test', deps)

    const call = mockHybridSearch.mock.calls[0]
    expect(call[4]).toBe(SEARCH_DEFAULTS.DEFAULT_LIMIT)
  })

  it('uses custom limit when provided', async () => {
    await searchMemory('test', deps, { limit: 5 })

    const call = mockHybridSearch.mock.calls[0]
    expect(call[4]).toBe(5)
  })
})
