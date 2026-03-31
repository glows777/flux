/**
 * Tool timeline utilities — pure logic, no React.
 *
 * Transforms AI SDK message.parts into typed Segments for timeline rendering,
 * and provides helpers for summary generation, icon mapping, and favicon URLs.
 */

import { isToolUIPart, getToolName } from 'ai'

// ─── Types ───

export type TimelineStepState = 'pending' | 'running' | 'done' | 'error'

export type TimelineStep = {
  readonly type: 'tool' | 'thinking'
  readonly toolName?: string
  readonly input?: unknown
  readonly output?: unknown
  readonly state?: TimelineStepState
  readonly errorText?: string
  readonly text?: string
  readonly partIndex: number
}

export type Segment =
  | {
      readonly type: 'timeline'
      readonly steps: readonly TimelineStep[]
      readonly collapsed: boolean
      readonly startIndex: number
    }
  | { readonly type: 'text'; readonly content: string; readonly startIndex: number }
  | {
      readonly type: 'display'
      readonly toolName: string
      readonly output: unknown
      readonly startIndex: number
    }

// ─── Constants ───

const DISPLAY_TOOLS = new Set([
  'display_rating_card',
  'display_comparison_table',
  'display_signal_badges',
])

export function isDisplayTool(toolName: string): boolean {
  return DISPLAY_TOOLS.has(toolName)
}

export function getFaviconUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
  } catch {
    return ''
  }
}

// ─── SDK State Mapping ───

const STATE_MAP: Record<string, TimelineStepState> = {
  'input-streaming': 'running',
  'input-available': 'running',
  'approval-requested': 'running',
  'approval-responded': 'running',
  'output-available': 'done',
  'output-error': 'error',
  'output-denied': 'error',
}

export function mapToolState(sdkState: string | undefined): TimelineStepState {
  if (!sdkState) return 'pending'
  return STATE_MAP[sdkState] ?? 'pending'
}

// ─── Skip set ───

const SKIP_PART_TYPES = new Set(['step-start', 'source-url', 'file', 'data'])

// ─── Grouping ───

type MutableTimeline = {
  type: 'timeline'
  steps: TimelineStep[]
  startIndex: number
}

function isAllDone(steps: readonly TimelineStep[]): boolean {
  return steps.every(s => s.type === 'thinking' || s.state === 'done')
}

export function groupPartsToSegments(parts: readonly unknown[]): Segment[] {
  const segments: Segment[] = []
  let currentTimeline: MutableTimeline | null = null

  function flushTimeline(collapsed: boolean) {
    if (currentTimeline && currentTimeline.steps.length > 0) {
      segments.push({
        type: 'timeline',
        steps: currentTimeline.steps,
        collapsed,
        startIndex: currentTimeline.startIndex,
      })
    }
    currentTimeline = null
  }

  function ensureTimeline(partIndex: number): MutableTimeline {
    if (!currentTimeline) {
      currentTimeline = { type: 'timeline', steps: [], startIndex: partIndex }
    }
    return currentTimeline
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] as Record<string, unknown>
    const partType = part.type as string | undefined

    if (!partType) continue

    // Skip known non-renderable parts
    if (SKIP_PART_TYPES.has(partType)) continue

    // Reasoning → timeline
    if (partType === 'reasoning') {
      const tl = ensureTimeline(i)
      const text = typeof part.text === 'string' ? part.text : ''
      if (text.trim()) {
        tl.steps.push({ type: 'thinking', text, partIndex: i })
      }
      continue
    }

    // Text → close timeline, create text segment
    if (partType === 'text') {
      flushTimeline(true)
      const text = typeof part.text === 'string' ? part.text : ''
      segments.push({ type: 'text', content: text, startIndex: i })
      continue
    }

    // Tool UI parts
    if (isToolUIPart(part as any)) {
      const toolName = getToolName(part as any)

      // Display tools → close timeline, create display segment
      if (isDisplayTool(toolName)) {
        flushTimeline(true)
        const output = 'output' in part ? part.output : undefined
        segments.push({ type: 'display', toolName, output, startIndex: i })
        continue
      }

      // Regular tools → timeline
      const tl = ensureTimeline(i)
      const sdkState = typeof part.state === 'string' ? part.state : undefined
      const errorText = 'errorText' in part && typeof part.errorText === 'string'
        ? part.errorText
        : undefined
      const input = 'input' in part ? part.input : undefined
      const output = 'output' in part ? part.output : undefined

      tl.steps.push({
        type: 'tool',
        toolName,
        input,
        output,
        state: mapToolState(sdkState),
        errorText,
        partIndex: i,
      })
      continue
    }

    // Unknown part type — skip
  }

  // Flush last timeline (TS narrows to 'never' due to closure mutations — use intermediate variable)
  const lastTimeline = currentTimeline as MutableTimeline | null
  if (lastTimeline) {
    flushTimeline(isAllDone(lastTimeline.steps))
  }

  return segments
}

// ─── Summary Helpers ───

function getStepSymbol(steps: readonly TimelineStep[]): string | undefined {
  for (const s of steps) {
    if (s.type === 'tool' && s.input && typeof s.input === 'object' && 'symbol' in s.input) {
      const val = (s.input as Record<string, unknown>).symbol
      if (typeof val === 'string') return val
    }
  }
  return undefined
}

function countArray(val: unknown): number {
  if (Array.isArray(val)) return val.length
  return 0
}

function getSourcesCount(output: unknown): number {
  if (output && typeof output === 'object' && 'sources' in output) {
    const sources = (output as Record<string, unknown>).sources
    if (Array.isArray(sources)) return sources.length
  }
  return 0
}

function getMemoryResultsCount(output: unknown): number {
  if (output && typeof output === 'object' && 'results' in output) {
    const results = (output as Record<string, unknown>).results
    if (Array.isArray(results)) return results.length
  }
  return 0
}

// ─── Summary ───

export function buildTimelineSummary(steps: readonly TimelineStep[]): string {
  if (steps.length === 0) return ''

  const toolSteps = steps.filter(s => s.type === 'tool')
  if (toolSteps.length === 0) return '深度思考'

  const okSteps = toolSteps.filter(s => s.state !== 'error')
  const symbol = getStepSymbol(toolSteps)
  const parts: string[] = []

  // Data query (getQuote + getCompanyInfo)
  const hasQuote = okSteps.some(s => s.toolName === 'getQuote')
  const hasInfo = okSteps.some(s => s.toolName === 'getCompanyInfo')
  if (hasQuote && hasInfo) {
    parts.push(`查询了 ${symbol ?? '股票'} 报价和公司信息`)
  } else if (hasQuote) {
    parts.push(`查询了 ${symbol ?? '股票'} 报价`)
  } else if (hasInfo) {
    parts.push(`获取了 ${symbol ?? '股票'} 公司信息`)
  }

  // History
  const hasHistory = okSteps.some(s => s.toolName === 'getHistory')
  if (hasHistory) {
    parts.push('获取了历史数据')
  }

  // Report
  const hasReport = okSteps.some(s => s.toolName === 'getReport')
  if (hasReport) {
    parts.push('获取了研报')
  }

  // News
  const newsSteps = okSteps.filter(s => s.toolName === 'getNews')
  if (newsSteps.length > 0) {
    const total = newsSteps.reduce((sum, s) => sum + countArray(s.output), 0)
    parts.push(total > 0 ? `搜索了 ${total} 条新闻` : '搜索了新闻')
  }

  // Sources (webSearch + webFetch)
  let sourceCount = 0
  for (const s of okSteps) {
    if (s.toolName === 'webSearch') sourceCount += getSourcesCount(s.output) || 1
    if (s.toolName === 'webFetch') sourceCount += 1
  }
  if (sourceCount > 0) {
    // Combine with news if both present
    const lastIdx = parts.length - 1
    if (lastIdx >= 0 && parts[lastIdx].includes('新闻')) {
      parts.splice(lastIdx, 1, `${parts[lastIdx]}和 ${sourceCount} 个来源`)
    } else {
      parts.push(`搜索了 ${sourceCount} 个来源`)
    }
  }

  // Indicators
  const hasIndicators = okSteps.some(s => s.toolName === 'calculateIndicators')
  if (hasIndicators) {
    parts.push('计算了技术指标')
  }

  // searchStock
  const searchStockSteps = okSteps.filter(s => s.toolName === 'searchStock')
  for (const s of searchStockSteps) {
    const query = s.input && typeof s.input === 'object' && 'query' in s.input
      ? (s.input as Record<string, unknown>).query
      : undefined
    parts.push(typeof query === 'string' ? `搜索了 "${query}"` : '搜索了股票')
  }

  // Memory
  let memoryCount = 0
  for (const s of okSteps) {
    if (s.toolName === 'memory_search') memoryCount += getMemoryResultsCount(s.output) || 1
    if (s.toolName === 'memory_read' || s.toolName === 'memory_list') memoryCount += 1
  }
  if (memoryCount > 0) {
    parts.push(`回忆了 ${memoryCount} 条记录`)
  }

  if (parts.length === 0) return ''

  let summary = parts.join('，') + '。'

  // Error count
  const errorCount = toolSteps.filter(s => s.state === 'error').length
  if (errorCount > 0) {
    summary = summary.replace('。', `。（${errorCount} 项失败）`)
  }

  return summary
}
