// ─── Valid Slots ───

export const VALID_SLOTS = [
  'user_profile',
  'portfolio_thesis',
  'market_views',
  'active_focus',
  'lessons',
  'agent_strategy',
] as const

export type MemorySlot = (typeof VALID_SLOTS)[number]

// ─── Slot Content Limits ───

export const SLOT_LIMITS: Record<MemorySlot, number> = {
  user_profile: 500,
  market_views: 500,
  active_focus: 500,
  lessons: 1000,
  portfolio_thesis: 2000,
  agent_strategy: 2000,
}

// ─── Version Entry ───

export interface MemoryVersionEntry {
  readonly id: string
  readonly slot: string
  readonly content: string
  readonly author: string
  readonly reason: string | null
  readonly createdAt: Date
}
