import { prisma } from '@/core/db'
import { generateEmbedding as defaultGenerateEmbedding } from './embedding'
import {
  DECAY_CONFIG,
  SEARCH_DEFAULTS,
  type ChunkSearchResult,
  type MemoryDeps,
} from './types'
import { hybridSearchChunks as defaultHybridSearchChunks } from './vector-ops'

// ─── Internal ───

export function getDecayMultiplier(
  docPath: string,
  evergreen: boolean,
  updatedAt?: Date,
): number {
  if (evergreen) return 1.0
  if (!updatedAt) return 1.0

  const dir = docPath.split('/')[0]
  const config = DECAY_CONFIG[docPath] ?? DECAY_CONFIG[dir]
  if (!config) return 1.0

  const ageInDays = (Date.now() - updatedAt.getTime()) / 86400000
  return Math.exp((-0.693 * ageInDays) / config.halfLifeDays)
}

// ─── Exported ───

export async function searchMemory(
  query: string,
  deps?: MemoryDeps,
  options?: { symbol?: string; limit?: number },
): Promise<ChunkSearchResult[]> {
  const db = deps?.db ?? prisma
  const embed = deps?.generateEmbedding ?? defaultGenerateEmbedding
  const search = deps?.hybridSearchChunks ?? defaultHybridSearchChunks
  const limit = options?.limit ?? SEARCH_DEFAULTS.DEFAULT_LIMIT
  const symbol = options?.symbol ?? null

  const embedding = await embed(query)
  const rawResults = await search(db, embedding, query, symbol, limit)

  if (rawResults.length === 0) return []

  const decayed = rawResults.map((result) => ({
    ...result,
    score:
      result.score *
      getDecayMultiplier(result.docPath, result.evergreen, result.updatedAt),
  }))

  return decayed.sort((a, b) => b.score - a.score)
}
