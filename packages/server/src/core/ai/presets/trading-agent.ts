import { resolve } from 'path'
import type { AIPlugin } from '../runtime/types'
import { promptPlugin } from '../plugins/prompt'
import { sessionPlugin } from '../plugins/session'
import { memoryPlugin } from '../plugins/memory'
import { skillPlugin } from '../plugins/skill'
import { dataPlugin } from '../plugins/data'
import { displayPlugin } from '../plugins/display'
import { tradingPlugin } from '../plugins/trading'
import { researchPlugin } from '../plugins/research'
import { createTools, type ToolDeps } from '../tools'
import { createTradingTools, type TradingToolDeps } from '../trading-tools'
import { createResearchTools } from '../research'
import { getReportFromCache } from '../cache'
import {
  getHistoryRaw,
  getInfo,
  getQuote,
  getNews,
  searchStocks,
} from '@/core/market-data'
import { getAlpacaClient } from '@/core/broker/alpaca-client'
import { prisma } from '@/core/db'

export interface TradingAgentPresetDeps {
  toolDeps?: ToolDeps
  tradingToolDeps?: TradingToolDeps
  createResearchToolsFactory?: () => Record<string, any>
}

export function tradingAgentPreset(deps?: TradingAgentPresetDeps): AIPlugin[] {
  const toolDeps: ToolDeps = deps?.toolDeps ?? {
    getQuote,
    getInfo,
    getHistoryRaw,
    getNews,
    getReportFromCache,
    searchStocks,
  }

  const tradingToolDeps: TradingToolDeps = deps?.tradingToolDeps ?? {
    alpacaClient: getAlpacaClient(),
    db: prisma as unknown as TradingToolDeps['db'],
    getQuote: async (symbol: string) => {
      const quote = await getQuote(symbol)
      return { price: quote.price }
    },
  }

  const researchToolsFactory = deps?.createResearchToolsFactory ?? (() => createResearchTools())

  return [
    promptPlugin(),
    sessionPlugin(),
    memoryPlugin(),
    skillPlugin({ skillsDirectory: resolve(import.meta.dir, '../../../../skills') }),
    dataPlugin({ deps: { createTools: () => createTools(toolDeps) } }),
    displayPlugin({ deps: { createTools: () => createTools(toolDeps) } }),
    tradingPlugin({ deps: { createTradingTools: () => createTradingTools(tradingToolDeps) } }),
    researchPlugin({ deps: { createResearchTools: researchToolsFactory } }),
  ]
}
