import type { UIMessage } from 'ai'
import type { PrismaClient } from '@prisma/client'

// ─── Document Paths ───

export const MEMORY_PATHS = {
  PROFILE: 'profile.md',
  PORTFOLIO: 'portfolio.md',
  WATCHLIST_CONTEXT: 'watchlist-context.md',
  TRADING_LESSONS: 'trading-lessons.md',
} as const

export const MEMORY_DIRS = {
  OPINIONS: 'opinions',
  DECISIONS: 'decisions',
  LOG: 'log',
} as const

// ─── Decay Configuration ───

export interface DecayConfig {
  readonly halfLifeDays: number
  readonly evergreen: boolean
}

export const DECAY_CONFIG: Record<string, DecayConfig> = {
  'profile.md': { halfLifeDays: Infinity, evergreen: true },
  'portfolio.md': { halfLifeDays: Infinity, evergreen: true },
  'watchlist-context.md': { halfLifeDays: Infinity, evergreen: true },
  'trading-lessons.md': { halfLifeDays: Infinity, evergreen: true },
  opinions: { halfLifeDays: 90, evergreen: false },
  decisions: { halfLifeDays: 60, evergreen: false },
  log: { halfLifeDays: 14, evergreen: false },
}

// ─── Search Result ───

export interface ChunkSearchResult {
  readonly id: string
  readonly content: string
  readonly docId: string
  readonly docPath: string
  readonly lineStart: number
  readonly lineEnd: number
  readonly entities: readonly string[]
  readonly score: number
  readonly evergreen: boolean
  readonly updatedAt: Date
}

// ─── Vector Search Result ───

export interface VectorSearchResult {
  readonly id: string
  readonly content: string
  readonly docId: string
  readonly vscore: number
}

// ─── Document Metadata ───

export interface DocumentInfo {
  readonly id: string
  readonly path: string
  readonly evergreen: boolean
  readonly updatedAt: Date
}

export interface DocumentDetail {
  readonly id: string
  readonly path: string
  readonly content: string
  readonly evergreen: boolean
  readonly updatedAt: string
  readonly entities: readonly string[]
}

// ─── Chunk ───

export interface Chunk {
  readonly content: string
  readonly lineStart: number
  readonly lineEnd: number
  readonly entities: readonly string[]
}

// ─── Dependency Injection ───

export interface MemoryDeps {
  readonly db: PrismaClient
  readonly chunkDocument?: (content: string) => Chunk[]
  readonly generateEmbedding?: (text: string) => Promise<number[]>
  readonly deleteChunksByDocId?: (db: PrismaClient, docId: string) => Promise<void>
  readonly upsertChunkWithEmbedding?: (
    db: PrismaClient,
    data: {
      readonly id: string
      readonly docId: string
      readonly content: string
      readonly lineStart: number
      readonly lineEnd: number
      readonly entities: string[]
    },
    embedding: number[],
  ) => Promise<void>
  readonly hybridSearchChunks?: (
    db: PrismaClient,
    embedding: number[],
    query: string,
    symbol: string | null,
    limit: number,
  ) => Promise<ChunkSearchResult[]>
}

// ─── Portfolio Markers ───

export const PORTFOLIO_AUTO_SECTION_START = '<!-- PORTFOLIO_AUTO_START -->'
export const PORTFOLIO_AUTO_SECTION_END = '<!-- PORTFOLIO_AUTO_END -->'

// ─── Search Defaults ───

export const SEARCH_DEFAULTS = {
  VECTOR_WEIGHT: 0.6,
  BM25_WEIGHT: 0.4,
  ENTITY_BOOST: 1.5,
  RRF_K: 60,
  DEFAULT_LIMIT: 10,
  CANDIDATE_MULTIPLIER: 2,
} as const

// ─── Context Limits ───

export const CONTEXT_LIMITS = {
  PROFILE_MAX_CHARS: 4000,
  PORTFOLIO_MAX_CHARS: 6000,
  OPINIONS_MAX_CHARS: 6000,
  RECENT_TRANSCRIPT_MAX_CHARS: 6000,
  TRADING_LESSONS_MAX_CHARS: 4000,
} as const

// ─── Transcript ───

export const TRANSCRIPT_REINDEX_DEBOUNCE_MS = 5 * 60 * 1000 // 5 minutes

/** ArrayField: nested array extraction spec */
export interface ArrayField {
  readonly field: string
  readonly pick: readonly string[]
}

export type FieldSpec = string | ArrayField

/** Data tool → key fields to preserve in transcript summary line */
export const TOOL_SUMMARY_FIELDS: Record<string, readonly FieldSpec[]> = {
  getQuote: ['price', 'change', 'volume'],
  getCompanyInfo: ['name', 'sector', 'pe', 'marketCap'],
  getNews: ['title'],
  webSearch: [{ field: 'sources', pick: ['title', 'url'] }],
  webFetch: ['url'],
  // getHistory: intentionally omitted (chart data has no text value)
} as const

/** Tool categories for transcript cleaning */
export const TOOL_CATEGORIES = {
  /** Tools whose results are summarized to one line */
  DATA: new Set(Object.keys(TOOL_SUMMARY_FIELDS)),
  /** Tools whose calls + results are filtered out entirely */
  MEMORY: new Set([
    'memory_read',
    'memory_write',
    'memory_append',
    'memory_search',
    'memory_list',
  ]),
  /** Display tools filtered out entirely */
  DISPLAY: new Set(['display_rating_card', 'display_comparison_table', 'display_signal_badges']),
  /** Trading tools filtered out entirely (details don't belong in transcripts) */
  TRADING: new Set([
    'placeOrder',
    'cancelOrder',
    'closePosition',
    'getPortfolio',
    'getTradeHistory',
  ]),
} as const

// ─── Transcript Message ───

/** Message with timestamp for transcript cleaning */
export interface TranscriptMessage {
  readonly message: UIMessage
  readonly createdAt: Date
}
