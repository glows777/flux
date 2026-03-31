import type { HistoryPoint } from '@/core/market-data'

/**
 * 研报上下文数据
 */
export interface ReportContext {
  readonly symbol: string
  readonly name: string
  readonly price: number
  readonly change: number
  readonly history: readonly HistoryPoint[]
  readonly metrics: {
    readonly pe?: number
    readonly marketCap?: number
    readonly eps?: number
    readonly dividendYield?: number
    readonly sector?: string
  }
}
