import { z } from 'zod'

// ─── Zod Schemas ───

export const MacroSchema = z.object({
  summary: z.string(),
  signal: z.enum(['risk-on', 'risk-off', 'neutral']),
  keyMetrics: z.array(z.object({
    label: z.string(),
    value: z.string(),
    change: z.string(),
  })),
})

export const SpotlightSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  change: z.number(),
  holding: z.object({
    shares: z.number(),
    avgCost: z.number(),
    gainPct: z.number(),
  }),
  reason: z.string(),
  action: z.string(),
  signal: z.enum(['bullish', 'bearish', 'neutral']),
})

export const CatalystSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  event: z.string(),
  date: z.string(),
  daysAway: z.number(),
})

export const MorningBriefSchema = z.object({
  generatedAt: z.string(),
  macro: MacroSchema,
  spotlight: z.array(SpotlightSchema),
  catalysts: z.array(CatalystSchema),
})

// ─── TypeScript Types (inferred from Zod) ───

export type MorningBrief = z.infer<typeof MorningBriefSchema>
export type MacroBrief = z.infer<typeof MacroSchema>
export type SpotlightItem = z.infer<typeof SpotlightSchema>
export type CatalystItem = z.infer<typeof CatalystSchema>

// ─── API Response Type ───

export interface BriefResponse {
  success: true
  data: MorningBrief
  cached: boolean
  generatedAt: string
}

// ─── Portfolio Context (组合级计算) ───

export interface PortfolioContext {
  positionWeights: { symbol: string; weight: number }[]
  topConcentration: number
  sectorExposure: { sector: string; weight: number }[]
  totalHoldings: number
}
