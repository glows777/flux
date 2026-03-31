import type { AlpacaClient } from '@/core/broker/alpaca-client'
import type { PrismaClient } from '@prisma/client'
import type { MemoryDeps } from '@/core/ai/memory/types'
import type { ToolDeps } from '@/core/ai/tools'
import type { ResearchDeps } from '@/core/ai/research'

// ─── Constants ───

export const MAX_STEPS = 70
export const BASELINE_KEY = 'baseline_equity'
export const STRATEGY_PATH = 'trading-agent/strategy.md'

export const SEED_STRATEGY_CONTENT = `# Trading Strategy

这是你的策略文件。你需要自己探索市场、积累经验、建立并迭代你的交易策略。
`

// ─── Interfaces ───

export interface HeartbeatContext {
  readonly timestamp: Date
  readonly marketStatus: string
  readonly equity: number
  readonly baseline: number
  readonly progress: number
}

export interface TradingAgentDeps {
  readonly alpacaClient: AlpacaClient
  readonly db: PrismaClient
  readonly toolDeps: ToolDeps
  readonly memoryDeps?: MemoryDeps
  readonly researchDeps?: ResearchDeps
}

export interface PnlRecord {
  readonly symbol: string
  readonly side: 'buy' | 'sell'
  readonly qty: number
  readonly filledAvgPrice: number | null
  readonly reasoning: string | null
  readonly filledAt: Date | null
  readonly createdAt: Date
  readonly realizedPl: number | null
  readonly holdingDays: number | null
}

export interface TradeNotification {
  readonly symbol: string
  readonly side: string
  readonly qty: number
  readonly price: number | null
  readonly reasoning: string
}

export interface OrderEventNotification {
  readonly event: string
  readonly symbol: string
  readonly side: string
  readonly qty: number
  readonly type: string
  readonly limitPrice?: number | null
  readonly stopPrice?: number | null
  readonly filledQty?: number | null
  readonly filledAvgPrice?: number | null
  readonly timeInForce?: string | null
}
