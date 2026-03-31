/**
 * Shared constants for @flux/shared
 * Period values extracted from lib/market-data/history.ts
 */

export const VALID_PERIODS = ['1D', '1W', '1M', '3M', 'YTD', '1Y'] as const
export type Period = (typeof VALID_PERIODS)[number]
