import {
  MEMORY_PATHS,
  PORTFOLIO_AUTO_SECTION_START,
  PORTFOLIO_AUTO_SECTION_END,
} from './types'
import {
  readDocument as readDocumentImpl,
  writeDocument as writeDocumentImpl,
} from './store'
import { formatCurrency } from '@flux/shared'
import type { AlpacaPosition } from '@/core/broker/alpaca-client'

// ─── Types ───

export interface PortfolioSyncDeps {
  readonly readDocument?: (path: string) => Promise<string | null>
  readonly writeDocument?: (path: string, content: string) => Promise<void>
}

interface HoldingRow {
  readonly symbol: string
  readonly name: string | null
  readonly shares: number
  readonly avgCost: number
}

// ─── Internal Helpers ───

function formatShares(shares: number): string {
  return Number.isInteger(shares) ? String(shares) : String(shares)
}

function formatTimestamp(now: Date): string {
  const iso = now.toISOString()
  return `_最后同步: ${iso.slice(0, 16).replace('T', 'T')}_`
}

function mapPositionToRow(p: AlpacaPosition): HoldingRow {
  return {
    symbol: p.symbol,
    name: null,
    shares: p.qty,
    avgCost: p.avgEntryPrice,
  }
}

export function buildHoldingsSection(
  holdings: ReadonlyArray<HoldingRow>,
  now?: Date,
): string {
  const timestamp = formatTimestamp(now ?? new Date())
  const lines: string[] = [PORTFOLIO_AUTO_SECTION_START]

  lines.push('## 当前持仓（自动同步，勿手动修改）')

  if (holdings.length === 0) {
    lines.push('_暂无持仓_')
  } else {
    lines.push('| 股票 | 名称 | 数量 | 成本 |')
    lines.push('|------|------|------|------|')
    for (const h of holdings) {
      const name = h.name ?? '—'
      const shares = formatShares(h.shares)
      const cost = formatCurrency(h.avgCost)
      lines.push(`| ${h.symbol} | ${name} | ${shares} | ${cost} |`)
    }
  }

  lines.push(timestamp)
  lines.push(PORTFOLIO_AUTO_SECTION_END)

  return lines.join('\n')
}

export function replaceAutoSection(
  existing: string,
  newAutoSection: string,
): string {
  const startIdx = existing.indexOf(PORTFOLIO_AUTO_SECTION_START)
  const endIdx = existing.indexOf(PORTFOLIO_AUTO_SECTION_END)

  if (startIdx === -1 || endIdx === -1) {
    return `${newAutoSection}\n\n${existing}`
  }

  const before = existing.slice(0, startIdx)
  const after = existing.slice(endIdx + PORTFOLIO_AUTO_SECTION_END.length)

  return `${before}${newAutoSection}${after}`
}

// ─── Exported ───

const NEW_DOC_TEMPLATE = (autoSection: string): string =>
  `# Portfolio\n\n${autoSection}\n\n## 交易计划\n\n## 配置笔记`

export async function syncPortfolioDocument(
  positions: ReadonlyArray<AlpacaPosition>,
  deps?: PortfolioSyncDeps,
): Promise<void> {
  const readDocument = deps?.readDocument ?? readDocumentImpl
  const writeDocument = deps?.writeDocument ?? writeDocumentImpl

  const holdings = positions.map(mapPositionToRow)
  const autoSection = buildHoldingsSection(holdings)

  const existing = await readDocument(MEMORY_PATHS.PORTFOLIO)

  if (existing) {
    const updated = replaceAutoSection(existing, autoSection)
    await writeDocument(MEMORY_PATHS.PORTFOLIO, updated)
  } else {
    await writeDocument(MEMORY_PATHS.PORTFOLIO, NEW_DOC_TEMPLATE(autoSection))
  }
}
