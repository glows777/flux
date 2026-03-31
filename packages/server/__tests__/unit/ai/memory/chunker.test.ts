import { describe, expect, it } from 'bun:test'

import { chunkDocument, extractEntities } from '@/core/ai/memory/chunker'

// ─── extractEntities ───

describe('extractEntities', () => {
  it('extracts uppercase tickers from text', () => {
    expect(extractEntities('I hold AAPL and TSLA')).toEqual(['AAPL', 'TSLA'])
  })

  it('filters out common non-ticker words', () => {
    expect(extractEntities('The CEO of AI company')).toEqual([])
  })

  it('deduplicates repeated tickers', () => {
    expect(extractEntities('AAPL is great, AAPL rocks')).toEqual(['AAPL'])
  })

  it('extracts $-prefixed tickers unconditionally', () => {
    expect(extractEntities('I bought $NVDA today')).toEqual(['NVDA'])
  })

  it('$-prefix bypasses the blacklist', () => {
    expect(extractEntities('$AI is interesting')).toEqual(['AI'])
  })
})

// ─── chunkDocument ───

describe('chunkDocument', () => {
  it('splits document by ## headings into separate chunks', () => {
    const input = '## Section A\nLine 1\nLine 2\n\n## Section B\nLine 3'
    const chunks = chunkDocument(input)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].content).toContain('Section A')
    expect(chunks[1].content).toContain('Section B')
  })

  it('tracks correct lineStart for each chunk', () => {
    const input = '## Section A\nLine 1\nLine 2\n\n## Section B\nLine 3'
    const chunks = chunkDocument(input)

    expect(chunks[0].lineStart).toBe(1)
    expect(chunks[1].lineStart).toBeGreaterThan(1)
  })

  it('applies sliding window for sections exceeding MAX_SECTION_CHARS', () => {
    const input = '## Big Section\n' + 'long text '.repeat(300)
    const chunks = chunkDocument(input)

    expect(chunks.length).toBeGreaterThan(1)
  })

  it('handles documents without headings as a single section', () => {
    const input = 'Just some text\nwithout headings'
    const chunks = chunkDocument(input)

    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks[0].content).toContain('Just some text')
  })

  it('populates entities from chunk content', () => {
    const input = '## Holdings\n持有 AAPL 100 股'
    const chunks = chunkDocument(input)

    expect(chunks[0].entities).toContain('AAPL')
  })
})
