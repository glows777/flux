import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

// Mock store.reindexDocument before importing the module under test
const mockReindexDocument = mock(() => Promise.resolve())
mock.module('@/core/ai/memory/store', () => ({
  reindexDocument: mockReindexDocument,
}))

import {
  scheduleReindex,
  flushReindex,
  getPendingCount,
} from '@/core/ai/memory/transcript-indexer'
import { TRANSCRIPT_REINDEX_DEBOUNCE_MS } from '@/core/ai/memory/types'

// ─── Mock setTimeout / clearTimeout ───

let capturedCallback: (() => void) | null = null
let capturedDelay: number | null = null
let mockSetTimeout: ReturnType<typeof spyOn>
let mockClearTimeout: ReturnType<typeof spyOn>

beforeEach(() => {
  mockReindexDocument.mockClear()
  mockReindexDocument.mockImplementation(() => Promise.resolve())

  capturedCallback = null
  capturedDelay = null

  mockSetTimeout = spyOn(globalThis, 'setTimeout').mockImplementation(
    (cb: (...args: unknown[]) => void, delay?: number) => {
      capturedCallback = cb as () => void
      capturedDelay = delay ?? null
      return 999 as unknown as ReturnType<typeof setTimeout>
    },
  )
  mockClearTimeout = spyOn(globalThis, 'clearTimeout').mockImplementation(
    () => {},
  )

  // Reset internal state by flushing any leftovers
  // (getPendingCount is just a read, flushReindex clears state)
})

afterEach(() => {
  mockSetTimeout.mockRestore()
  mockClearTimeout.mockRestore()
})

// ─── scheduleReindex basics ───

describe('scheduleReindex', () => {
  it('adds docId to dirty set', () => {
    scheduleReindex('doc-1')
    expect(getPendingCount()).toBe(1)
  })

  it('deduplicates same docId', () => {
    scheduleReindex('doc-1')
    scheduleReindex('doc-1')
    expect(getPendingCount()).toBe(1)
  })

  it('tracks multiple distinct docIds', () => {
    scheduleReindex('doc-1')
    scheduleReindex('doc-2')
    expect(getPendingCount()).toBe(2)
  })
})

// ─── flushReindex ───

describe('flushReindex', () => {
  it('calls reindexDocument for each dirty docId', async () => {
    scheduleReindex('doc-1')
    scheduleReindex('doc-2')

    await flushReindex()

    expect(mockReindexDocument).toHaveBeenCalledTimes(2)
    const calledDocIds = mockReindexDocument.mock.calls.map((c) => c[0])
    expect(calledDocIds).toContain('doc-1')
    expect(calledDocIds).toContain('doc-2')
  })

  it('clears pending count after flush', async () => {
    scheduleReindex('doc-1')
    scheduleReindex('doc-2')

    await flushReindex()

    expect(getPendingCount()).toBe(0)
  })

  it('does not call reindexDocument when dirty set is empty', async () => {
    await flushReindex()

    expect(mockReindexDocument).not.toHaveBeenCalled()
  })

  it('does not throw when reindexDocument rejects (Promise.allSettled)', async () => {
    mockReindexDocument.mockImplementation(() =>
      Promise.reject(new Error('reindex failed')),
    )
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})

    scheduleReindex('doc-1')

    await expect(flushReindex()).resolves.toBeUndefined()

    errorSpy.mockRestore()
  })

  it('passes deps to reindexDocument', async () => {
    const fakeDeps = { db: {} } as any
    scheduleReindex('doc-1', fakeDeps)

    await flushReindex()

    expect(mockReindexDocument).toHaveBeenCalledWith('doc-1', fakeDeps)
  })

  it('clears debounce timer if one exists', async () => {
    scheduleReindex('doc-1')

    await flushReindex()

    expect(mockClearTimeout).toHaveBeenCalled()
  })
})

// ─── Debounce behavior ───

describe('debounce behavior', () => {
  it('calls setTimeout with correct delay', () => {
    scheduleReindex('doc-1')

    expect(mockSetTimeout).toHaveBeenCalled()
    expect(capturedDelay).toBe(TRANSCRIPT_REINDEX_DEBOUNCE_MS)
  })

  it('resets timer on subsequent schedule calls', () => {
    scheduleReindex('doc-1')
    scheduleReindex('doc-2')

    expect(mockClearTimeout).toHaveBeenCalled()
    expect(mockSetTimeout).toHaveBeenCalledTimes(2)
    // reindexDocument should NOT have been called yet (timer pending)
    expect(mockReindexDocument).not.toHaveBeenCalled()
  })

  it('triggers executePendingReindex when timer fires', async () => {
    scheduleReindex('doc-1')

    expect(capturedCallback).not.toBeNull()
    // Simulate timer expiry
    capturedCallback!()
    // Allow microtask to settle
    await new Promise((r) => queueMicrotask(r))

    expect(mockReindexDocument).toHaveBeenCalledWith('doc-1', undefined)
  })

  it('allows new dirty entries after flush', async () => {
    scheduleReindex('doc-1')
    scheduleReindex('doc-2')

    await flushReindex()
    expect(getPendingCount()).toBe(0)

    scheduleReindex('doc-3')
    expect(getPendingCount()).toBe(1)
  })

  it('does not throw when timer fires and reindexDocument rejects', async () => {
    mockReindexDocument.mockImplementation(() =>
      Promise.reject(new Error('boom')),
    )
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})

    scheduleReindex('doc-1')

    expect(capturedCallback).not.toBeNull()
    // .catch in scheduleReindex should swallow the error
    capturedCallback!()
    await new Promise((r) => queueMicrotask(r))

    // If we got here, no unhandled rejection
    expect(true).toBe(true)

    errorSpy.mockRestore()
  })

  it('uses latest deps when timer fires', async () => {
    const deps1 = { db: { id: 1 } } as any
    const deps2 = { db: { id: 2 } } as any

    scheduleReindex('doc-1', deps1)
    scheduleReindex('doc-2', deps2)

    // Trigger the timer
    capturedCallback!()
    await new Promise((r) => queueMicrotask(r))

    // Both calls should use deps2 (the latest)
    for (const call of mockReindexDocument.mock.calls) {
      expect(call[1]).toBe(deps2)
    }
  })
})
