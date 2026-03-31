import type { DocumentDetail, DocumentInfo, MemoryDeps } from './types'
import { MEMORY_PATHS } from './types'
import { chunkDocument as chunkDocumentImpl } from './chunker'
import { generateEmbedding as generateEmbeddingImpl } from './embedding'
import {
  deleteChunksByDocId as deleteChunksByDocIdImpl,
  upsertChunkWithEmbedding as upsertChunkWithEmbeddingImpl,
} from './vector-ops'
import { prisma } from '@/core/db'

// ─── Internal Helpers ───

function getDefaultDeps(): MemoryDeps {
  return { db: prisma }
}

function isEvergreen(path: string): boolean {
  const evergreenPaths = Object.values(MEMORY_PATHS) as string[]
  return evergreenPaths.includes(path)
}

async function reindexDocumentInternal(
  docId: string,
  content: string,
  deps: MemoryDeps,
): Promise<void> {
  const { db } = deps
  const chunkDocument = deps.chunkDocument ?? chunkDocumentImpl
  const generateEmbedding = deps.generateEmbedding ?? generateEmbeddingImpl
  const deleteChunksByDocId = deps.deleteChunksByDocId ?? deleteChunksByDocIdImpl
  const upsertChunkWithEmbedding = deps.upsertChunkWithEmbedding ?? upsertChunkWithEmbeddingImpl

  await deleteChunksByDocId(db, docId)
  const chunks = chunkDocument(content)
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.content)
    await upsertChunkWithEmbedding(
      db,
      {
        id: `${docId}-${chunk.lineStart}`,
        docId,
        content: chunk.content,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        entities: [...chunk.entities],
      },
      embedding,
    )
  }
}

function getTranscriptPath(sessionId: string): string {
  const date = new Date().toISOString().slice(0, 10)
  return `log/${date}-${sessionId}.md`
}

// ─── Exported Functions ───

export async function readDocument(
  path: string,
  deps?: MemoryDeps,
): Promise<string | null> {
  const { db } = deps ?? getDefaultDeps()
  const doc = await db.memoryDocument.findUnique({ where: { path } })
  return doc?.content ?? null
}

export async function getDocumentDetail(
  path: string,
  deps?: MemoryDeps,
): Promise<DocumentDetail | null> {
  const { db } = deps ?? getDefaultDeps()
  const doc = await db.memoryDocument.findUnique({
    where: { path },
    include: { chunks: { select: { entities: true } } },
  })
  if (!doc) return null

  const allEntities = doc.chunks.flatMap((c: { entities: string[] }) => c.entities)
  const uniqueEntities = [...new Set(allEntities)]

  return {
    id: doc.id,
    path: doc.path,
    content: doc.content,
    evergreen: doc.evergreen,
    updatedAt: doc.updatedAt.toISOString(),
    entities: uniqueEntities,
  }
}

export async function writeDocument(
  path: string,
  content: string,
  deps?: MemoryDeps,
): Promise<void> {
  const { db } = deps ?? getDefaultDeps()
  const existing = await db.memoryDocument.findUnique({ where: { path } })

  let docId: string
  if (existing) {
    const updated = await db.memoryDocument.update({
      where: { id: existing.id },
      data: { content },
    })
    docId = updated.id
  } else {
    const created = await db.memoryDocument.create({
      data: { path, content, evergreen: isEvergreen(path) },
    })
    docId = created.id
  }

  // Fire-and-forget reindex
  reindexDocument(docId, deps ?? getDefaultDeps()).catch((e) =>
    console.error(`[memory] reindex failed for doc ${docId}:`, e),
  )
}

export async function appendDocument(
  path: string,
  entry: string,
  deps?: MemoryDeps,
): Promise<void> {
  const timestamp = `[${new Date().toISOString().slice(0, 10)}]`
  const existing = await readDocument(path, deps)

  const newContent = existing
    ? `${existing}\n${timestamp}\n${entry}\n`
    : `${timestamp}\n${entry}\n`

  await writeDocument(path, newContent, deps)
}

export async function deleteDocument(
  path: string,
  deps?: MemoryDeps,
): Promise<void> {
  const { db } = deps ?? getDefaultDeps()
  await db.memoryDocument.deleteMany({ where: { path } })
}

export async function listDocuments(
  deps?: MemoryDeps,
): Promise<DocumentInfo[]> {
  const { db } = deps ?? getDefaultDeps()
  return db.memoryDocument.findMany({
    select: { id: true, path: true, evergreen: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  })
}

export async function appendTranscript(
  sessionId: string,
  cleanedMarkdown: string,
  symbol?: string,
  deps?: MemoryDeps,
): Promise<string> {
  const { db } = deps ?? getDefaultDeps()
  const path = getTranscriptPath(sessionId)
  const existing = await db.memoryDocument.findUnique({ where: { path } })

  if (existing) {
    await db.memoryDocument.update({
      where: { id: existing.id },
      data: { content: `${existing.content}\n\n${cleanedMarkdown}` },
    })
    return existing.id
  }

  const date = new Date().toISOString().slice(0, 10)
  const label = symbol ?? '通用'
  const title = `# ${date} ${label} 对话`
  const created = await db.memoryDocument.create({
    data: {
      path,
      content: `${title}\n\n${cleanedMarkdown}`,
      evergreen: false,
    },
  })
  return created.id
}

export async function reindexDocument(
  docId: string,
  deps?: MemoryDeps,
): Promise<void> {
  const resolved = deps ?? getDefaultDeps()
  const doc = await resolved.db.memoryDocument.findUnique({ where: { id: docId } })
  if (!doc) return

  await reindexDocumentInternal(docId, doc.content, resolved)
}

export async function findRecentTranscript(
  symbol: string | null,
  deps?: MemoryDeps,
): Promise<{ path: string; content: string } | null> {
  const { db } = deps ?? getDefaultDeps()
  const label = symbol ?? '通用'
  const doc = await db.memoryDocument.findFirst({
    where: {
      path: { startsWith: 'log/' },
      content: { contains: `${label} 对话` },
    },
    orderBy: { updatedAt: 'desc' },
    select: { path: true, content: true },
  })
  return doc ?? null
}
