import { CONTEXT_LIMITS, MEMORY_PATHS } from './types'
import {
  readDocument as readDocumentImpl,
  findRecentTranscript as findRecentTranscriptImpl,
} from './store'

// ─── Types ───

export interface LoaderDeps {
  readDocument?: (path: string) => Promise<string | null>
  findRecentTranscript?: (symbol: string | null) => Promise<{ path: string; content: string } | null>
}

export interface LoaderOptions {
  readonly skipTranscript?: boolean
}

// ─── Internal Helpers ───

export function truncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content

  const truncated = content.slice(0, maxChars)
  const lastNewline = truncated.lastIndexOf('\n')
  const cutPoint = lastNewline > 0 ? lastNewline : maxChars

  return `${truncated.slice(0, cutPoint)}\n...(内容过长，请用 memory_read 查看完整内容)`
}

export function truncateTail(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content

  const PREFIX = '(前面的对话已省略)\n\n'

  const blocks = content.split('\n## ')
  if (blocks.length > 1) {
    const accumulated: string[] = []
    let total = 0

    for (let i = blocks.length - 1; i >= 1; i--) {
      const block = `## ${blocks[i]}`
      if (total + block.length > maxChars) break
      accumulated.unshift(block)
      total += block.length
    }

    if (accumulated.length > 0) {
      return `${PREFIX}${accumulated.join('\n')}`
    }
  }

  const tail = content.slice(-maxChars)
  const firstNewline = tail.indexOf('\n')
  const cleanTail = firstNewline > 0 ? tail.slice(firstNewline + 1) : tail

  return `${PREFIX}${cleanTail}`
}

// ─── Exported ───

export async function loadMemoryContext(
  symbol?: string,
  options?: LoaderOptions & LoaderDeps,
): Promise<string> {
  const readDocument = options?.readDocument ?? readDocumentImpl
  const findRecentTranscript = options?.findRecentTranscript ?? findRecentTranscriptImpl

  const promises: Promise<{ key: string; content: string | null }>[] = [
    readDocument(MEMORY_PATHS.PROFILE).then((c) => ({ key: 'profile', content: c })),
    readDocument(MEMORY_PATHS.PORTFOLIO).then((c) => ({ key: 'portfolio', content: c })),
    readDocument(MEMORY_PATHS.TRADING_LESSONS).then((c) => ({ key: 'tradingLessons', content: c })),
  ]

  if (!options?.skipTranscript) {
    promises.push(
      findRecentTranscript(symbol ?? null).then((r) => ({
        key: 'transcript',
        content: r?.content ?? null,
      })),
    )
  }

  if (symbol) {
    promises.push(
      readDocument(`opinions/${symbol}.md`).then((c) => ({ key: 'opinions', content: c })),
    )
  }

  const results = await Promise.all(promises)

  const sections: string[] = []

  for (const { key, content } of results) {
    if (content === null) continue

    switch (key) {
      case 'profile':
        sections.push(
          `## 用户档案\n${truncate(content, CONTEXT_LIMITS.PROFILE_MAX_CHARS)}`,
        )
        break
      case 'portfolio':
        sections.push(
          `## 当前持仓与计划\n${truncate(content, CONTEXT_LIMITS.PORTFOLIO_MAX_CHARS)}`,
        )
        break
      case 'tradingLessons':
        sections.push(
          `## 交易教训\n${truncate(content, CONTEXT_LIMITS.TRADING_LESSONS_MAX_CHARS)}`,
        )
        break
      case 'opinions':
        sections.push(
          `## 关于 ${symbol} 的笔记\n${truncate(content, CONTEXT_LIMITS.OPINIONS_MAX_CHARS)}`,
        )
        break
      case 'transcript':
        sections.push(
          `## 上次对话（自动加载）\n${truncateTail(content, CONTEXT_LIMITS.RECENT_TRANSCRIPT_MAX_CHARS)}`,
        )
        break
    }
  }

  return sections.length > 0 ? sections.join('\n\n') : ''
}
