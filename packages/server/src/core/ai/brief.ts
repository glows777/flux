/**
 * Morning Brief — core generation pipeline
 *
 * 4-layer data fetch → portfolio context → prompt build → Gemini call →
 * Zod validate → cache read/write → fallback
 */

import { MorningBriefSchema, type MorningBrief, type PortfolioContext } from '@flux/shared'
import { generateText } from 'ai'
import type { LanguageModel } from 'ai'
import type { PortfolioData, StockMetrics, NewsItem, MacroTicker, WatchlistItemWithChart } from '@flux/shared'
import type { HistoryPoint } from '@/core/market-data'
import type { EarningsL1, UpcomingEarning } from '@/core/finance/types'
import type { EnhancedIndicators } from './prompts'
import { getAlpacaClient } from '@/core/broker/alpaca-client'
import { calculateSummary, mapAlpacaPositionToHoldingItem } from '@/core/broker/portfolio-calc'
import {
    getMacro as defaultGetMacroData,
    findVixFromMacro,
    getHistoryRaw as defaultGetHistoryRaw,
    getInfo as defaultGetInfo,
    getStockInfo as defaultGetStockInfo,
    getNews as defaultGetStockNews,
} from '@/core/market-data'
import { getWatchlistItems as defaultGetWatchlistItems } from '@/core/api/watchlist'
import { calculateIndicators as defaultCalculateIndicators } from './prompts'
import {
  queryLatestEarningsL1BatchFromCache as defaultQueryLatestEarningsL1BatchFromCache,
  queryUpcomingEarningsFromCache as defaultQueryUpcomingEarningsFromCache,
} from '@/core/finance/cache'
import { getModel } from './providers'
import { prisma } from '@/core/db'

// ─── Types ───

export interface BriefResult {
  data: MorningBrief
  cached: boolean
  generatedAt: string
}

interface BriefCacheRecord {
  date: string
  content: string
  createdAt: Date
  updatedAt: Date
}

export interface BriefDeps {
  // ─── Data fetchers ───
  getPortfolio: () => Promise<PortfolioData>
  getMacroData: () => Promise<MacroTicker[]>
  getWatchlistItems: () => Promise<WatchlistItemWithChart[]>
  getStockHistory: (symbol: string) => Promise<HistoryPoint[]>
  getStockInfo: (symbol: string) => Promise<StockMetrics>
  getStockNews: (symbol: string, limit: number) => Promise<NewsItem[]>

  // ─── Pure compute ───
  calculateIndicators: (history: readonly HistoryPoint[]) => EnhancedIndicators
  calculatePortfolioContext: (holdings: readonly PortfolioHolding[]) => PortfolioContext

  // ─── Cache queries ───
  queryLatestEarningsL1BatchFromCache: (symbols: string[]) => Promise<Map<string, EarningsL1 | null>>
  queryUpcomingEarningsFromCache: (symbols: string[], withinDays: number) => Promise<UpcomingEarning[]>
  findBriefCache: (date: string) => Promise<BriefCacheRecord | null>
  upsertBriefCache: (date: string, content: string) => Promise<void>

  // ─── AI ───
  model: LanguageModel
}

interface PortfolioHolding {
  symbol: string
  shares: number
  currentPrice: number
  sector?: string
}

// ─── Per-holding enriched data ───

interface HoldingEnrichedData {
  symbol: string
  indicators: EnhancedIndicators
  info: StockMetrics
  news: NewsItem[]
  l1: EarningsL1 | null
}

// ─── Time utilities ───

export function toBeijingDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

export function isUSDaylightSaving(date: Date): boolean {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() // 0-indexed

  // DST: 2nd Sunday of March through 1st Sunday of November
  if (month < 2 || month > 10) return false   // Jan, Feb, Dec → no DST
  if (month > 2 && month < 10) return true     // Apr–Oct → DST

  if (month === 2) {
    // March: DST starts on 2nd Sunday
    const marchFirst = new Date(Date.UTC(year, 2, 1))
    const firstSunday = (7 - marchFirst.getUTCDay()) % 7 + 1
    const secondSunday = firstSunday + 7
    return date.getUTCDate() > secondSunday ||
      (date.getUTCDate() === secondSunday && date.getUTCHours() >= 7) // ET 2am = UTC 7am
  }

  // November: DST ends on 1st Sunday
  const novFirst = new Date(Date.UTC(year, 10, 1))
  const firstSunday = (7 - novFirst.getUTCDay()) % 7 + 1
  return date.getUTCDate() < firstSunday ||
    (date.getUTCDate() === firstSunday && date.getUTCHours() < 6) // ET 2am = UTC 6am (still DST)
}

export function getMarketCloseUTC(now: Date): Date {
  const isDST = isUSDaylightSaving(now)
  const closeHourUTC = isDST ? 20 : 21
  const close = new Date(now)
  close.setUTCHours(closeHourUTC, 0, 0, 0)
  return close
}

export function isBriefExpired(
  brief: { date: string; createdAt: Date; updatedAt: Date },
  now: Date = new Date(),
): boolean {
  const todayDate = toBeijingDateString(now)

  if (brief.date !== todayDate) return true

  const marketCloseUTC = getMarketCloseUTC(now)
  const lastWritten = brief.updatedAt.getTime() > brief.createdAt.getTime()
    ? brief.updatedAt
    : brief.createdAt
  return now.getTime() > marketCloseUTC.getTime() &&
    lastWritten.getTime() < marketCloseUTC.getTime()
}

// ─── Rate-limit detection ───

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return msg.includes('429') || msg.includes('rate limit')
}

// ─── Concurrent fetch with fallback ───

export async function fetchWithFallback<T>(
  symbols: string[],
  fetcher: (symbol: string) => Promise<T>,
  retryDelayMs = 200,
): Promise<(T | null)[]> {
  const settled = await Promise.allSettled(symbols.map(fetcher))

  const results = new Map<number, T>()
  const failedIndices: number[] = []

  for (const [i, result] of settled.entries()) {
    if (result.status === 'fulfilled') {
      results.set(i, result.value)
    } else {
      failedIndices.push(i)
    }
  }

  // Serial retry with backoff, graceful degradation on permanent failure
  for (const i of failedIndices) {
    if (retryDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs))
    }
    try {
      results.set(i, await fetcher(symbols[i]))
    } catch {
      // Skip failed symbol rather than killing entire pipeline
    }
  }

  return symbols.map((_, i) => results.get(i) ?? null)
}

// ─── Fallback brief ───

const VIX_SIGNAL_RISK_OFF = 25
const VIX_SIGNAL_RISK_ON = 20

function inferSignalFromVIX(macro: MacroTicker[]): 'risk-on' | 'risk-off' | 'neutral' {
  const vixData = findVixFromMacro(macro)
  if (!vixData) return 'neutral'
  const vix = parseFloat(vixData.val)
  if (Number.isNaN(vix)) return 'neutral'
  if (vix >= VIX_SIGNAL_RISK_OFF) return 'risk-off'
  if (vix <= VIX_SIGNAL_RISK_ON) return 'risk-on'
  return 'neutral'
}

function buildMacroSummaryFromData(macro: MacroTicker[]): string {
  return macro.map(m => `${m.sym}: ${m.val} (${m.chg})`).join('，')
}

function formatMacroMetrics(macro: MacroTicker[]): Array<{ label: string; value: string; change: string }> {
  return macro.map(m => ({
    label: m.sym,
    value: m.val,
    change: m.chg,
  }))
}

export function buildFallbackBrief(
  macro: MacroTicker[],
  catalysts: UpcomingEarning[],
): MorningBrief {
  return {
    generatedAt: new Date().toISOString(),
    macro: {
      summary: buildMacroSummaryFromData(macro),
      signal: inferSignalFromVIX(macro),
      keyMetrics: formatMacroMetrics(macro),
    },
    spotlight: [],
    catalysts: catalysts.map(c => ({
      symbol: c.symbol,
      name: c.name,
      event: c.event,
      date: c.date,
      daysAway: c.daysAway,
    })),
  }
}

// ─── Prompt builder ───

function formatIndicators(ind: EnhancedIndicators): string {
  const rsi = ind.rsi != null ? `${ind.rsi}` : '无数据'
  const ma20 = ind.ma20 != null ? `$${ind.ma20.toFixed(2)}` : '无数据'
  const ma50 = ind.ma50 != null ? `$${ind.ma50.toFixed(2)}` : '无数据'
  const ma200 = ind.ma200 != null ? `$${ind.ma200.toFixed(2)}` : '无数据'
  const trend = ind.trendPosition ?? '无数据'
  const macd = ind.macd
    ? `${ind.macd.value.toFixed(2)}/${ind.macd.signal.toFixed(2)} 柱 ${ind.macd.histogram.toFixed(2)} (${ind.macd.crossover ?? '无交叉'})`
    : '无数据'
  const support = ind.support != null ? `$${ind.support.toFixed(2)}` : '无数据'
  const resistance = ind.resistance != null ? `$${ind.resistance.toFixed(2)}` : '无数据'
  const volume = ind.volumeRatio != null ? `${ind.volumeRatio.toFixed(2)}` : '无数据'

  return `  RSI(14): ${rsi} | MA20: ${ma20} | MA50: ${ma50} | MA200: ${ma200}
  趋势位置: ${trend} | MACD: ${macd}
  支撑 ${support} / 阻力 ${resistance} | 量比: ${volume}`
}

function formatInfo(info: StockMetrics): string {
  const pe = info.pe != null ? `${info.pe}` : '无数据'
  const mc = info.marketCap != null ? `$${info.marketCap}` : '无数据'
  const eps = info.eps != null ? `$${info.eps}` : '无数据'
  const div = info.dividendYield != null ? `${info.dividendYield}%` : '无数据'
  const sector = info.sector ?? '无数据'
  return `  P/E: ${pe} | 市值: ${mc} | EPS: ${eps} | 股息率: ${div} | 板块: ${sector}`
}

function formatL1(l1: EarningsL1 | null): string {
  if (!l1) return '  无缓存数据'

  const rev = l1.beatMiss.revenue
    ? `实际 $${l1.beatMiss.revenue.actual} vs 预期 $${l1.beatMiss.revenue.expected}`
    : '无数据'
  const eps = l1.beatMiss.eps
    ? `实际 $${l1.beatMiss.eps.actual} vs 预期 $${l1.beatMiss.eps.expected}`
    : '无数据'
  const yoy = l1.keyFinancials.revenueYoY != null ? `${l1.keyFinancials.revenueYoY}%` : '无数据'
  const latestMargin = l1.margins.length > 0 ? l1.margins[0] : null
  const net = latestMargin?.net != null ? `${latestMargin.net}%` : '无数据'
  const fcf = l1.keyFinancials.fcf != null ? `$${l1.keyFinancials.fcf}` : '无数据'
  const dta = l1.keyFinancials.debtToAssets != null ? `${l1.keyFinancials.debtToAssets}%` : '无数据'

  return `  (${l1.period})
  营收 $${l1.keyFinancials.revenue} YoY ${yoy} | EPS: ${eps}
  Revenue: ${rev}
  净利率: ${net} | FCF: ${fcf} | 负债率: ${dta}`
}

function formatNews(news: NewsItem[]): string {
  if (news.length === 0) return '  无数据'
  return news.map(n => `  · ${n.title} (${n.source}, ${n.time})`).join('\n')
}

function buildPrompt(
  holdings: readonly HoldingEnrichedData[],
  portfolio: PortfolioData,
  macro: MacroTicker[],
  upcoming: UpcomingEarning[],
  ctx: PortfolioContext,
): string {
  const holdingSections = holdings.map(h => {
    const holdingItem = portfolio.holdings.find(p => p.symbol === h.symbol)
    const shares = holdingItem?.shares ?? 0
    const avgCost = holdingItem?.avgCost ?? 0
    const price = holdingItem?.currentPrice ?? 0
    const change = holdingItem?.dailyChange ?? 0
    const cost = shares * avgCost
    const gainPct = avgCost > 0 ? ((price - avgCost) / avgCost * 100).toFixed(1) : '0'
    const weight = ctx.positionWeights.find(p => p.symbol === h.symbol)?.weight ?? 0

    return `### ${h.symbol} (${h.info.name}) — 仓位占比 ${weight}%
持仓: ${shares} 股 × 均价 $${avgCost} = 成本 $${cost} | 现价 $${price} (${change >= 0 ? '+' : ''}${change}%) | 浮盈 ${gainPct}%
技术面:
${formatIndicators(h.indicators)}
基本面:
${formatInfo(h.info)}
最近财报:
${formatL1(h.l1)}
近期新闻 (最多 3 条):
${formatNews(h.news)}`
  }).join('\n\n')

  const macroSection = macro.map(m => `${m.sym}: ${m.val} ${m.chg}`).join(' | ')

  const catalystSection = upcoming.length > 0
    ? upcoming.map(u => `${u.symbol}: ${u.date}（${u.daysAway}天后）`).join('\n')
    : '无数据'

  const sectorStr = ctx.sectorExposure.map(s => `${s.sector} ${s.weight}%`).join(', ')

  return `你是 Flux OS 的 AI 分析师，负责每日为用户生成个性化投资简报。
你的分析必须完全基于下方提供的数据，不得编造任何未给出的数字或事实。

## 组合概览
持仓数: ${ctx.totalHoldings} | 总市值: $${portfolio.summary.totalValue.toFixed(0)} | 最大单仓: ${ctx.topConcentration}%
板块分布: ${sectorStr}

## 用户持仓（逐只）

${holdingSections}

## 宏观环境
${macroSection}

## 近期财报日历（14天内）
${catalystSection}

---

请生成今日简报，严格按以下 JSON schema 输出，不要有任何多余文字：
{
  "generatedAt": "ISO 8601 时间戳",
  "macro": {
    "summary": "一句话宏观总结",
    "signal": "risk-on | risk-off | neutral",
    "keyMetrics": [{ "label": "指标名", "value": "数值", "change": "涨跌幅" }]
  },
  "spotlight": [{
    "symbol": "AAPL",
    "name": "公司名",
    "price": 数字,
    "change": 涨跌幅百分比数字,
    "holding": { "shares": 数字, "avgCost": 数字, "gainPct": 数字 },
    "reason": "分析理由（须引用至少 2 个维度的具体数据）",
    "action": "观察建议（风险提示，非指令）",
    "signal": "bullish | bearish | neutral"
  }],
  "catalysts": [{
    "symbol": "NVDA",
    "name": "公司名",
    "event": "事件描述",
    "date": "YYYY-MM-DD",
    "daysAway": 数字
  }]
}

规则：
- spotlight 对每只持仓股都生成分析，按信号强度排序（bearish > bullish > neutral，同级按 |gainPct| 降序）
- reason 必须引用至少 2 个维度的具体数据（技术面 + 基本面/财报/新闻），例如：
  "RSI 78 进入超买，MACD 死叉确认；上季营收 YoY +35% 但净利率环比收窄 2pp"
  不允许只引用单一指标，不允许没有数字的泛泛之谈
- action 是基于数据的观察和风险提示，而非指令式建议。例如：
  ✓ "RSI 超买 + 量比 1.8 放量，短期回调风险上升，注意支撑位"
  ✓ "MACD 金叉 + 突破阻力位，趋势偏多，可关注回踩确认"
  ✗ "建议减仓 20-30%"（← 禁止：没有足够信息支撑具体仓位建议）
  ✗ "持续关注"（← 禁止：没有信息量的废话）
- 当某字段标注"无数据"时，不得在 reason 中引用该字段
- catalysts 只列 14 天内事件，最多 4 条，无数据则返回空数组
- 全部使用中文输出`
}

// ─── Default deps ───

function getDefaultDeps(): BriefDeps {
  return {
    getPortfolio: async (): Promise<PortfolioData> => {
      const alpaca = getAlpacaClient()
      const [account, positions, macroData] = await Promise.allSettled([
        alpaca.getAccount(),
        alpaca.getPositions(),
        defaultGetMacroData(),
      ])

      const acct = account.status === 'fulfilled' ? account.value : null
      const pos = positions.status === 'fulfilled' ? positions.value : []

      if (!acct) {
        return {
          holdings: [],
          summary: {
            totalValue: 0, totalCost: 0, totalPnL: 0, totalPnLPercent: 0,
            todayPnL: 0, todayPnLPercent: 0, topContributor: null, vix: 0,
          },
        }
      }

      const nameResults = await Promise.allSettled(
        pos.map(p => defaultGetInfo(p.symbol)),
      )
      const holdingItems = pos.map((p, i) => {
        const name = nameResults[i].status === 'fulfilled'
          ? nameResults[i].value.name ?? null : null
        return mapAlpacaPositionToHoldingItem(p, name)
      })

      const macro = macroData.status === 'fulfilled' ? macroData.value : []
      const vixData = findVixFromMacro(macro)
      const vix = vixData ? parseFloat(vixData.val) || 0 : 0

      return { holdings: holdingItems, summary: calculateSummary(holdingItems, vix) }
    },
    getMacroData: defaultGetMacroData,
    getWatchlistItems: defaultGetWatchlistItems,
    getStockHistory: (symbol: string) => defaultGetHistoryRaw(symbol, 252),
    getStockInfo: defaultGetStockInfo,
    getStockNews: defaultGetStockNews,
    calculateIndicators: defaultCalculateIndicators,
    calculatePortfolioContext,
    queryLatestEarningsL1BatchFromCache: defaultQueryLatestEarningsL1BatchFromCache,
    queryUpcomingEarningsFromCache: defaultQueryUpcomingEarningsFromCache,
    model: getModel('main'),
    findBriefCache: async (date: string) => {
      const row = await prisma.morningBriefCache.findUnique({
        where: { date },
        select: { date: true, content: true, createdAt: true, updatedAt: true },
      })
      return row
    },
    upsertBriefCache: async (date: string, content: string) => {
      await prisma.morningBriefCache.upsert({
        where: { date },
        update: { content },
        create: { date, content },
      })
    },
  }
}

// ─── Portfolio context (existing) ───

export function calculatePortfolioContext(
  holdings: readonly PortfolioHolding[],
): PortfolioContext {
  const totalValue = holdings.reduce(
    (sum, h) => sum + h.shares * h.currentPrice, 0,
  )

  if (totalValue === 0) {
    return {
      positionWeights: [],
      topConcentration: 0,
      sectorExposure: [],
      totalHoldings: 0,
    }
  }

  const positionWeights = holdings.map(h => ({
    symbol: h.symbol,
    weight: Number(((h.shares * h.currentPrice / totalValue) * 100).toFixed(2)),
  }))

  const topConcentration = Math.max(...positionWeights.map(p => p.weight))

  const sectorMap = new Map<string, number>()
  for (const h of holdings) {
    const sector = h.sector || 'Unknown'
    const weight = (h.shares * h.currentPrice / totalValue) * 100
    sectorMap.set(sector, (sectorMap.get(sector) || 0) + weight)
  }

  const sectorExposure = [...sectorMap.entries()]
    .map(([sector, weight]) => ({ sector, weight: Number(weight.toFixed(2)) }))
    .sort((a, b) => b.weight - a.weight)

  return {
    positionWeights,
    topConcentration,
    sectorExposure,
    totalHoldings: holdings.length,
  }
}

// ─── Prefetched data (for composite endpoints) ───

export interface BriefPrefetched {
  readonly portfolio?: PortfolioData
  readonly macro?: MacroTicker[]
  readonly watchlist?: WatchlistItemWithChart[]
}

// ─── Main entry ───

export async function generateBrief(
  forceRefresh: boolean,
  deps?: BriefDeps,
  now?: Date,
  prefetched?: BriefPrefetched,
): Promise<BriefResult> {
  const d = deps ?? getDefaultDeps()
  const currentTime = now ?? new Date()

  // 1. Check cache
  if (!forceRefresh) {
    const todayDate = toBeijingDateString(currentTime)
    const cached = await d.findBriefCache(todayDate)
    if (cached && !isBriefExpired(cached, currentTime)) {
      const data = tryParseAndValidate(cached.content)
      if (data) {
        const lastWritten = cached.updatedAt > cached.createdAt ? cached.updatedAt : cached.createdAt
        return { data, cached: true, generatedAt: lastWritten.toISOString() }
      }
    }
  }

  // 2. Layer 1 — parallel global data (use prefetched when available)
  const [portfolio, macro, watchlist] = await Promise.all([
    prefetched?.portfolio ?? d.getPortfolio(),
    prefetched?.macro ?? d.getMacroData(),
    prefetched?.watchlist ?? d.getWatchlistItems(),
  ])

  const holdingSymbols = portfolio.holdings.map(h => h.symbol)
  const watchlistSymbols = watchlist.map(w => w.id)
  const allSymbols = [...new Set([...holdingSymbols, ...watchlistSymbols])]

  // Empty portfolio → fallback (macro + catalysts only, no AI call)
  if (holdingSymbols.length === 0) {
    const upcoming = await d.queryUpcomingEarningsFromCache(allSymbols, 14)
    const fallback = buildFallbackBrief(macro, upcoming)
    return { data: fallback, cached: false, generatedAt: fallback.generatedAt }
  }

  // 3. Layer 2 + Layer 3 — run in parallel (Layer 3 is DB-only, no dependency on Layer 2)
  const [enrichedData, l1Map, upcoming] = await Promise.all([
    fetchWithFallback(holdingSymbols, async (symbol) => {
      const [history, info, news] = await Promise.all([
        d.getStockHistory(symbol),
        d.getStockInfo(symbol),
        d.getStockNews(symbol, 3),
      ])
      const indicators = d.calculateIndicators(history)
      return { symbol, indicators, info, news } as Omit<HoldingEnrichedData, 'l1'>
    }),
    d.queryLatestEarningsL1BatchFromCache(holdingSymbols),
    d.queryUpcomingEarningsFromCache(allSymbols, 14),
  ])

  // Merge L1 into enriched data (skip symbols that failed enrichment)
  const holdingsWithL1: HoldingEnrichedData[] = []
  for (const data of enrichedData) {
    if (data) {
      holdingsWithL1.push({ ...data, l1: l1Map.get(data.symbol) ?? null })
    }
  }

  // 5. Layer 4 — portfolio context (pure local)
  const holdingsForContext: PortfolioHolding[] = portfolio.holdings.map(h => {
    const info = holdingsWithL1.find(e => e.symbol === h.symbol)?.info
    return {
      symbol: h.symbol,
      shares: h.shares,
      currentPrice: h.currentPrice,
      sector: info?.sector,
    }
  })
  const portfolioCtx = d.calculatePortfolioContext(holdingsForContext)

  // 6. Build prompt
  const prompt = buildPrompt(holdingsWithL1, portfolio, macro, upcoming, portfolioCtx)

  // 7. Call Gemini + Zod validate (catch AI errors → fallback)
  const maxTokens = Math.min(500 * holdingSymbols.length + 500, 4000)
  const todayDate = toBeijingDateString(currentTime)

  try {
    const firstTextResult = await generateText({ model: d.model, prompt, temperature: 0.3, maxOutputTokens: maxTokens })
    const firstAttempt = firstTextResult.text
    const firstResult = tryParseAndValidate(firstAttempt)

    if (firstResult) {
      await d.upsertBriefCache(todayDate, JSON.stringify(firstResult))
      return { data: firstResult, cached: false, generatedAt: firstResult.generatedAt }
    }

    // Retry with lower temperature
    const secondTextResult = await generateText({ model: d.model, prompt, temperature: 0.1, maxOutputTokens: maxTokens })
    const secondAttempt = secondTextResult.text
    const secondResult = tryParseAndValidate(secondAttempt)

    if (secondResult) {
      await d.upsertBriefCache(todayDate, JSON.stringify(secondResult))
      return { data: secondResult, cached: false, generatedAt: secondResult.generatedAt }
    }
  } catch {
    // AI call failed (region block, rate limit, network error, etc.)
    // Fall through to fallback — no cache write
  }

  // AI failed or Zod validation failed twice → fallback (no cache write)
  const fallback = buildFallbackBrief(macro, upcoming)
  return { data: fallback, cached: false, generatedAt: fallback.generatedAt }
}

// ─── Helpers ───

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('```')) {
    // Remove opening ```json or ``` and closing ```
    return trimmed
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '')
  }
  return trimmed
}

function tryParseAndValidate(raw: string): MorningBrief | null {
  try {
    const cleaned = stripCodeFences(raw)
    const json = JSON.parse(cleaned)
    const result = MorningBriefSchema.safeParse(json)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
