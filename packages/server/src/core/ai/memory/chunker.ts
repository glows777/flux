import type { Chunk } from './types'

// ─── Constants ───

const MAX_SECTION_CHARS = 2400
const TARGET_CHUNK_CHARS = 1600
const OVERLAP_CHARS = 320

const NON_TICKER_WORDS = new Set([
  'A', 'I', 'O',
  'AI', 'CEO', 'CFO', 'CTO', 'IPO', 'ETF', 'GDP', 'CPI', 'PPI', 'PE',
  'EPS', 'ROE', 'ROA', 'RSI', 'MA', 'MACD', 'EBITDA', 'SEC', 'FDA',
  'FED', 'EU', 'US', 'UK', 'USD', 'EUR', 'JPY', 'API', 'AWS',
  'AND', 'THE', 'FOR', 'NOT', 'BUT', 'ALL', 'ANY', 'CAN', 'HAS',
  'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'ARE', 'HIS', 'HOW', 'ITS',
  'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'DID', 'GET',
  'HIM', 'LET', 'SAY', 'SHE', 'TOO', 'USE', 'DAY', 'HAD', 'HOT',
  'OIL', 'SIT', 'TOP', 'RED', 'RUN', 'BIG',
])

// ─── Entity Extraction ───

export function extractEntities(text: string): string[] {
  const dollarMatches = [...text.matchAll(/\$([A-Z]{1,5})\b/g)].map(m => m[1])
  const bareMatches = [...text.matchAll(/\b([A-Z]{1,5})\b/g)]
    .map(m => m[1])
    .filter(w => !NON_TICKER_WORDS.has(w))

  return [...new Set([...dollarMatches, ...bareMatches])]
}

// ─── Chunking ───

interface Section {
  readonly text: string
  readonly lineStart: number
}

function splitSections(content: string): readonly Section[] {
  const lines = content.split('\n')
  const sections: Section[] = []
  let currentLines: string[] = []
  let sectionStart = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('## ') && currentLines.length > 0) {
      sections.push({ text: currentLines.join('\n'), lineStart: sectionStart })
      currentLines = [line]
      sectionStart = i + 1
    } else {
      currentLines.push(line)
    }
  }

  if (currentLines.length > 0) {
    sections.push({ text: currentLines.join('\n'), lineStart: sectionStart })
  }

  return sections
}

function slidingWindowChunks(section: Section): readonly Chunk[] {
  const { text, lineStart } = section
  const chunks: Chunk[] = []
  let offset = 0

  while (offset < text.length) {
    const end = Math.min(offset + TARGET_CHUNK_CHARS, text.length)
    const slice = text.slice(offset, end)

    const linesBeforeOffset = text.slice(0, offset).split('\n').length - 1
    const sliceLineCount = slice.split('\n').length

    const chunkLineStart = lineStart + linesBeforeOffset
    const chunkLineEnd = chunkLineStart + sliceLineCount - 1

    chunks.push({
      content: slice,
      lineStart: chunkLineStart,
      lineEnd: chunkLineEnd,
      entities: extractEntities(slice),
    })

    if (end >= text.length) break
    offset += TARGET_CHUNK_CHARS - OVERLAP_CHARS
  }

  return chunks
}

export function chunkDocument(content: string): Chunk[] {
  const sections = splitSections(content)

  return sections.flatMap(section => {
    if (section.text.length <= MAX_SECTION_CHARS) {
      const lineCount = section.text.split('\n').length
      return [{
        content: section.text,
        lineStart: section.lineStart,
        lineEnd: section.lineStart + lineCount - 1,
        entities: extractEntities(section.text),
      }]
    }
    return [...slidingWindowChunks(section)]
  })
}
