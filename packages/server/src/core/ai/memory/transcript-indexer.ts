import type { MemoryDeps } from './types'
import { TRANSCRIPT_REINDEX_DEBOUNCE_MS } from './types'
import { reindexDocument } from './store'

// ─── Module-level State ───

const dirtyDocIds = new Set<string>()
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let latestDeps: MemoryDeps | undefined

// ─── Internal ───

async function executePendingReindex(
  deps: MemoryDeps | undefined,
): Promise<void> {
  const snapshot = [...dirtyDocIds]
  dirtyDocIds.clear()

  if (snapshot.length === 0) return

  const results = await Promise.allSettled(
    snapshot.map((docId) => reindexDocument(docId, deps)),
  )

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('transcript reindex failed:', result.reason)
    }
  }
}

// ─── Exported Functions ───

export function scheduleReindex(
  docId: string,
  deps?: MemoryDeps,
): void {
  dirtyDocIds.add(docId)
  latestDeps = deps

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
  }

  debounceTimer = setTimeout(() => {
    executePendingReindex(latestDeps).catch((e) =>
      console.error('transcript reindex failed:', e),
    )
  }, TRANSCRIPT_REINDEX_DEBOUNCE_MS)
}

export async function flushReindex(
  deps?: MemoryDeps,
): Promise<void> {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  if (deps) {
    latestDeps = deps
  }

  await executePendingReindex(latestDeps)
}

export function getPendingCount(): number {
  return dirtyDocIds.size
}
