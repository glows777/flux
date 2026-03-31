/**
 * Symbol validation and normalization utilities
 *
 * Provides a single source of truth for ticker symbol handling
 * across all market-data modules.
 */

/** Allows 1-10 chars of A-Z, a-z, 0-9, dot, dash, caret */
const SYMBOL_PATTERN = /^[A-Za-z0-9.\-^]{1,10}$/

/**
 * Validate whether a string is a plausible ticker symbol.
 *
 * Accepted examples: `AAPL`, `BRK.B`, `^VIX`, `BTC-USD`
 */
export function isValidSymbol(symbol: string): boolean {
    return SYMBOL_PATTERN.test(symbol)
}

/**
 * Normalize a ticker symbol — trim whitespace and uppercase.
 */
export function normalizeSymbol(symbol: string): string {
    return symbol.trim().toUpperCase()
}
