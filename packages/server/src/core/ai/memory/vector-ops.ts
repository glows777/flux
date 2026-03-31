import { Prisma, type PrismaClient } from '@prisma/client'

import type { ChunkSearchResult, VectorSearchResult } from './types'
import { SEARCH_DEFAULTS } from './types'

// ─── Internal Helpers ───

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

// ─── Exported Functions ───

export async function upsertChunkWithEmbedding(
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
): Promise<void> {
  const vector = Prisma.raw(`'${toVectorLiteral(embedding)}'::vector`)

  await db.$executeRaw`
    INSERT INTO "MemoryChunk" (id, "docId", content, "lineStart", "lineEnd", entities, embedding)
    VALUES (
      ${data.id}, ${data.docId}, ${data.content},
      ${data.lineStart}, ${data.lineEnd},
      ${data.entities}::text[], ${vector}
    )
    ON CONFLICT (id) DO UPDATE SET
      content = EXCLUDED.content,
      "lineStart" = EXCLUDED."lineStart",
      "lineEnd" = EXCLUDED."lineEnd",
      entities = EXCLUDED.entities,
      embedding = EXCLUDED.embedding
  `
}

export async function deleteChunksByDocId(
  db: PrismaClient,
  docId: string,
): Promise<void> {
  await db.memoryChunk.deleteMany({ where: { docId } })
}

export async function hybridSearchChunks(
  db: PrismaClient,
  embedding: number[],
  query: string,
  symbol: string | null,
  limit: number,
): Promise<ChunkSearchResult[]> {
  const candidateLimit = limit * SEARCH_DEFAULTS.CANDIDATE_MULTIPLIER
  const vector = Prisma.raw(`'${toVectorLiteral(embedding)}'::vector`)
  const symbolCast = symbol !== null
    ? Prisma.raw(`'${symbol.replace(/'/g, "''")}'::text`)
    : Prisma.raw('NULL::text')
  const vectorWeight = Prisma.raw(`${SEARCH_DEFAULTS.VECTOR_WEIGHT}`)
  const bm25Weight = Prisma.raw(`${SEARCH_DEFAULTS.BM25_WEIGHT}`)
  const rrfK = Prisma.raw(`${SEARCH_DEFAULTS.RRF_K}`)
  const entityBoost = Prisma.raw(`${SEARCH_DEFAULTS.ENTITY_BOOST}`)

  if (!query) {
    return db.$queryRaw<ChunkSearchResult[]>`
      WITH
      semantic AS (
        SELECT id, ROW_NUMBER() OVER () AS rank
        FROM "MemoryChunk"
        ORDER BY embedding <=> ${vector}
        LIMIT ${candidateLimit}
      ),
      scored AS (
        SELECT
          s.id,
          (${vectorWeight} / (${rrfK} + s.rank)
            * CASE
                WHEN ${symbolCast} IS NOT NULL AND ${symbolCast} = ANY(c.entities)
                THEN ${entityBoost} ELSE 1.0
              END
          )::float AS score
        FROM semantic s
        JOIN "MemoryChunk" c ON c.id = s.id
      )
      SELECT
        c.id, c.content, c."docId", c."lineStart", c."lineEnd",
        c.entities,
        s.score,
        d.path AS "docPath", d.evergreen,
        d."updatedAt"
      FROM scored s
      JOIN "MemoryChunk" c ON c.id = s.id
      JOIN "MemoryDocument" d ON d.id = c."docId"
      ORDER BY s.score DESC
      LIMIT ${limit}
    `
  }

  return db.$queryRaw<ChunkSearchResult[]>`
    WITH
    semantic AS (
      SELECT id, ROW_NUMBER() OVER () AS rank
      FROM "MemoryChunk"
      ORDER BY embedding <=> ${vector}
      LIMIT ${candidateLimit}
    ),
    fulltext AS (
      SELECT id,
        ROW_NUMBER() OVER (ORDER BY paradedb.score(id) DESC) AS rank
      FROM "MemoryChunk"
      WHERE content @@@ ${query}
      LIMIT ${candidateLimit}
    ),
    rrf AS (
      SELECT id, ${vectorWeight} / (${rrfK} + rank) AS s
      FROM semantic
      UNION ALL
      SELECT id, ${bm25Weight} / (${rrfK} + rank) AS s
      FROM fulltext
    ),
    scored AS (
      SELECT
        rrf.id,
        (SUM(rrf.s) * CASE
          WHEN ${symbolCast} IS NOT NULL AND ${symbolCast} = ANY(c.entities)
          THEN ${entityBoost} ELSE 1.0
        END)::float AS score
      FROM rrf
      JOIN "MemoryChunk" c ON c.id = rrf.id
      GROUP BY rrf.id, c.entities
    )
    SELECT
      c.id, c.content, c."docId", c."lineStart", c."lineEnd",
      c.entities,
      s.score,
      d.path AS "docPath", d.evergreen,
      d."updatedAt"
    FROM scored s
    JOIN "MemoryChunk" c ON c.id = s.id
    JOIN "MemoryDocument" d ON d.id = c."docId"
    ORDER BY s.score DESC
    LIMIT ${limit}
  `
}

export async function vectorSearchChunks(
  db: PrismaClient,
  embedding: number[],
  limit: number,
): Promise<VectorSearchResult[]> {
  const vector = Prisma.raw(`'${toVectorLiteral(embedding)}'::vector`)

  return db.$queryRaw<VectorSearchResult[]>`
    SELECT
      id, content, "docId",
      (1 - (embedding <=> ${vector}))::float AS vscore
    FROM "MemoryChunk"
    ORDER BY embedding <=> ${vector}
    LIMIT ${limit}
  `
}
