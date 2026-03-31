import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { CONTEXT_LIMITS } from '@/core/ai/memory/types'
import { loadMemoryContext } from '@/core/ai/memory/loader'

// ─── Mock Setup (DI) ───

const mockReadDocument = mock(() => Promise.resolve(null as string | null))
const mockFindRecentTranscript = mock(
  () => Promise.resolve(null as { path: string; content: string } | null),
)

function createDeps() {
  return {
    readDocument: mockReadDocument,
    findRecentTranscript: mockFindRecentTranscript,
  }
}

let deps: ReturnType<typeof createDeps>

beforeEach(() => {
  deps = createDeps()
  mockReadDocument.mockClear()
  mockFindRecentTranscript.mockClear()
})

// ─── loadMemoryContext ───

describe('loadMemoryContext', () => {
  it('returns empty string when all documents are null', async () => {
    const result = await loadMemoryContext('AAPL', deps)

    expect(result).toBe('')
  })

  it('returns profile section when only profile.md exists', async () => {
    mockReadDocument.mockImplementation((path: string) =>
      Promise.resolve(path === 'profile.md' ? '偏好成长股' : null),
    )

    const result = await loadMemoryContext('AAPL', deps)

    expect(result).toContain('用户档案')
    expect(result).toContain('偏好成长股')
  })

  it('returns opinions section when only opinions/{symbol}.md exists', async () => {
    mockReadDocument.mockImplementation((path: string) =>
      Promise.resolve(path === 'opinions/AAPL.md' ? '看好服务业务' : null),
    )

    const result = await loadMemoryContext('AAPL', deps)

    expect(result).toContain('AAPL')
    expect(result).toContain('看好服务业务')
  })

  it('truncates profile content exceeding 4000 chars', async () => {
    const longContent = 'A'.repeat(5000)
    mockReadDocument.mockImplementation((path: string) =>
      Promise.resolve(path === 'profile.md' ? longContent : null),
    )

    const result = await loadMemoryContext('AAPL', deps)

    expect(result.length).toBeLessThan(longContent.length)
    expect(result).toContain('内容过长，请用 memory_read 查看完整内容')
  })

  it('includes all three sections separated by \\n\\n when all docs exist', async () => {
    mockReadDocument.mockImplementation((path: string) => {
      if (path === 'profile.md') return Promise.resolve('用户档案内容')
      if (path === 'portfolio.md') return Promise.resolve('持仓内容')
      if (path === 'opinions/AAPL.md') return Promise.resolve('看法内容')
      return Promise.resolve(null)
    })

    const result = await loadMemoryContext('AAPL', deps)

    expect(result).toContain('用户档案')
    expect(result).toContain('当前持仓与计划')
    expect(result).toContain('AAPL')
    // Sections joined by \n\n
    const sections = result.split('\n\n')
    expect(sections.length).toBeGreaterThanOrEqual(3)
  })

  it('includes transcript section when findRecentTranscript returns data', async () => {
    mockFindRecentTranscript.mockResolvedValueOnce({
      path: 'log/2026-03-08-session.md',
      content: '## 14:32\n对话内容',
    })

    const result = await loadMemoryContext('AAPL', deps)

    expect(result).toContain('上次对话')
    expect(result).toContain('对话内容')
  })

  it('tail-truncates long transcript preserving last ## blocks', async () => {
    const blocks = Array.from({ length: 50 }, (_, i) => `## Block ${i}\n${'x'.repeat(200)}`).join(
      '\n',
    )
    // Ensure content exceeds RECENT_TRANSCRIPT_MAX_CHARS
    expect(blocks.length).toBeGreaterThan(CONTEXT_LIMITS.RECENT_TRANSCRIPT_MAX_CHARS)

    mockFindRecentTranscript.mockResolvedValueOnce({
      path: 'log/2026-03-08-session.md',
      content: blocks,
    })

    const result = await loadMemoryContext('AAPL', deps)

    expect(result).toContain('(前面的对话已省略)')
    // Should contain the last block
    expect(result).toContain('Block 49')
    // Should NOT contain the first block
    expect(result).not.toContain('Block 0')
  })

  it('tail-truncates long transcript without ## separators using \\n fallback', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `Line ${i}: ${'y'.repeat(20)}`).join('\n')
    expect(lines.length).toBeGreaterThan(CONTEXT_LIMITS.RECENT_TRANSCRIPT_MAX_CHARS)

    mockFindRecentTranscript.mockResolvedValueOnce({
      path: 'log/2026-03-08-session.md',
      content: lines,
    })

    const result = await loadMemoryContext('AAPL', deps)

    expect(result).toContain('(前面的对话已省略)')
    // Should contain the last line
    expect(result).toContain('Line 499')
  })

  it('excludes transcript section when findRecentTranscript returns null', async () => {
    mockReadDocument.mockImplementation((path: string) =>
      Promise.resolve(path === 'profile.md' ? '档案' : null),
    )
    mockFindRecentTranscript.mockResolvedValueOnce(null)

    const result = await loadMemoryContext('AAPL', deps)

    expect(result).not.toContain('上次对话')
  })

  it('loads profile + portfolio + transcript when symbol is undefined', async () => {
    mockReadDocument.mockImplementation((path: string) => {
      if (path === 'profile.md') return Promise.resolve('档案')
      if (path === 'portfolio.md') return Promise.resolve('持仓')
      return Promise.resolve(null)
    })

    const result = await loadMemoryContext(undefined, deps)

    expect(result).toContain('用户档案')
    expect(result).toContain('当前持仓与计划')
    // Should not call readDocument with opinions path
    const calledPaths = mockReadDocument.mock.calls.map((c) => c[0])
    expect(calledPaths).not.toContain('opinions/undefined.md')
    // Should call findRecentTranscript with null
    expect(mockFindRecentTranscript).toHaveBeenCalledWith(null)
  })

  it('calls readDocument 3 times + findRecentTranscript 1 time when symbol is provided', async () => {
    await loadMemoryContext('AAPL', deps)

    expect(mockReadDocument).toHaveBeenCalledTimes(4)
    expect(mockFindRecentTranscript).toHaveBeenCalledTimes(1)
    expect(mockFindRecentTranscript).toHaveBeenCalledWith('AAPL')
  })

  it('calls readDocument 2 times + findRecentTranscript 1 time when symbol is undefined', async () => {
    await loadMemoryContext(undefined, deps)

    expect(mockReadDocument).toHaveBeenCalledTimes(3)
    expect(mockFindRecentTranscript).toHaveBeenCalledTimes(1)
    expect(mockFindRecentTranscript).toHaveBeenCalledWith(null)
  })

  it('calls readDocument with trading-lessons.md path', async () => {
    await loadMemoryContext('AAPL', deps)

    const calledPaths = mockReadDocument.mock.calls.map((c) => c[0])
    expect(calledPaths).toContain('trading-lessons.md')
  })

  it('includes trading lessons section when trading-lessons.md exists', async () => {
    mockReadDocument.mockImplementation(async (path: string) => {
      if (path === 'trading-lessons.md') return '## 择时\n- 财报前不建仓'
      return null
    })

    const result = await loadMemoryContext(undefined, deps)
    expect(result).toContain('## 交易教训')
    expect(result).toContain('财报前不建仓')
  })

  it('omits trading lessons section when trading-lessons.md does not exist', async () => {
    mockReadDocument.mockResolvedValue(null)

    const result = await loadMemoryContext(undefined, deps)
    expect(result).not.toContain('交易教训')
  })

  it('skips transcript loading when skipTranscript is true', async () => {
    await loadMemoryContext(undefined, { ...deps, skipTranscript: true })

    expect(mockFindRecentTranscript).not.toHaveBeenCalled()
  })
})
