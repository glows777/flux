import { z } from 'zod'

/**
 * Stock symbol validation pattern
 * Extracted from server/routes.ts — allows uppercase letters, digits, dots, hyphens, carets
 */
export const SYMBOL_PATTERN = /^[A-Za-z0-9.\-^]{1,10}$/

export const symbolSchema = z.string().regex(SYMBOL_PATTERN, 'Invalid stock symbol')

export const periodSchema = z.enum(['1D', '1W', '1M', '3M', 'YTD', '1Y'])
