/**
 * P2-11: Format Utility Unit Tests
 *
 * Test scenarios per spec:
 * - T11-06: formatMarketCap 万亿 (Trillion)
 * - T11-07: formatMarketCap 十亿 (Billion)
 * - T11-08: formatMarketCap 百万 (Million)
 * - T11-09: formatMarketCap null/undefined
 * - T11-10: formatPE normal value
 * - T11-11: formatPE null/undefined
 * - T11-12: formatEPS normal value
 * - T11-13: formatDividendYield normal value
 */

import { describe, expect, it } from 'bun:test'
import {
    formatDividendYield,
    formatEPS,
    formatLargeNumber,
    formatMarketCap,
    formatPE,
} from '@flux/shared'

// ─── formatLargeNumber ───

describe('formatLargeNumber', () => {
    describe('Trillion values', () => {
        it('formats 1.5 trillion as $1.50T', () => {
            expect(formatLargeNumber(1.5e12)).toBe('$1.50T')
        })

        it('formats exactly 1 trillion', () => {
            expect(formatLargeNumber(1e12)).toBe('$1.00T')
        })
    })

    describe('Billion values', () => {
        it('formats 2.5 billion as $2.50B', () => {
            expect(formatLargeNumber(2.5e9)).toBe('$2.50B')
        })

        it('formats exactly 1 billion', () => {
            expect(formatLargeNumber(1e9)).toBe('$1.00B')
        })
    })

    describe('Million values', () => {
        it('formats 500 million as $500.00M', () => {
            expect(formatLargeNumber(500e6)).toBe('$500.00M')
        })

        it('formats exactly 1 million', () => {
            expect(formatLargeNumber(1e6)).toBe('$1.00M')
        })
    })

    describe('Small values', () => {
        it('formats values below 1 million with comma separators', () => {
            expect(formatLargeNumber(500000)).toBe('$500,000')
        })

        it('formats zero as $0', () => {
            expect(formatLargeNumber(0)).toBe('$0')
        })
    })

    describe('Negative values', () => {
        it('formats negative billion', () => {
            expect(formatLargeNumber(-2.5e9)).toBe('-$2.50B')
        })

        it('formats negative million', () => {
            expect(formatLargeNumber(-150e6)).toBe('-$150.00M')
        })

        it('formats negative small number', () => {
            expect(formatLargeNumber(-500000)).toBe('-$500,000')
        })
    })

    describe('null/undefined handling', () => {
        it('returns "--" for null', () => {
            expect(formatLargeNumber(null)).toBe('--')
        })

        it('returns "--" for undefined', () => {
            expect(formatLargeNumber(undefined)).toBe('--')
        })
    })
})

// ─── formatMarketCap ───

describe('formatMarketCap', () => {
    // T11-06: Trillion
    describe('T11-06: Trillion values', () => {
        it('formats 1.5 trillion as $1.50T', () => {
            expect(formatMarketCap(1.5e12)).toBe('$1.50T')
        })

        it('formats exactly 1 trillion as $1.00T', () => {
            expect(formatMarketCap(1e12)).toBe('$1.00T')
        })

        it('formats 3 trillion as $3.00T', () => {
            expect(formatMarketCap(3e12)).toBe('$3.00T')
        })
    })

    // T11-07: Billion
    describe('T11-07: Billion values', () => {
        it('formats 2.5 billion as $2.50B', () => {
            expect(formatMarketCap(2.5e9)).toBe('$2.50B')
        })

        it('formats exactly 1 billion as $1.00B', () => {
            expect(formatMarketCap(1e9)).toBe('$1.00B')
        })

        it('formats 999.99 billion as $999.99B', () => {
            expect(formatMarketCap(999.99e9)).toBe('$999.99B')
        })
    })

    // T11-08: Million
    describe('T11-08: Million values', () => {
        it('formats 500 million as $500.00M', () => {
            expect(formatMarketCap(500e6)).toBe('$500.00M')
        })

        it('formats exactly 1 million as $1.00M', () => {
            expect(formatMarketCap(1e6)).toBe('$1.00M')
        })
    })

    // T11-09: null/undefined
    describe('T11-09: null/undefined handling', () => {
        it('returns "--" for undefined', () => {
            expect(formatMarketCap(undefined)).toBe('--')
        })

        it('returns "--" for null (cast)', () => {
            expect(formatMarketCap(null as unknown as undefined)).toBe('--')
        })
    })

    // Edge cases
    describe('Edge cases', () => {
        it('formats values below 1 million with locale string', () => {
            const result = formatMarketCap(500000)
            expect(result).toStartWith('$')
        })
    })
})

// ─── formatPE ───

describe('formatPE', () => {
    // T11-10: Normal value
    describe('T11-10: Normal values', () => {
        it('formats 25.3 as "25.30"', () => {
            expect(formatPE(25.3)).toBe('25.30')
        })

        it('formats 28.5 as "28.50"', () => {
            expect(formatPE(28.5)).toBe('28.50')
        })

        it('formats integer 30 as "30.00"', () => {
            expect(formatPE(30)).toBe('30.00')
        })
    })

    // T11-11: null/undefined
    describe('T11-11: null/undefined handling', () => {
        it('returns "--" for undefined', () => {
            expect(formatPE(undefined)).toBe('--')
        })

        it('returns "--" for null (cast)', () => {
            expect(formatPE(null as unknown as undefined)).toBe('--')
        })
    })
})

// ─── formatEPS ───

describe('formatEPS', () => {
    // T11-12: Normal value
    describe('T11-12: Normal values', () => {
        it('formats 5.67 as "$5.67"', () => {
            expect(formatEPS(5.67)).toBe('$5.67')
        })

        it('formats 6.15 as "$6.15"', () => {
            expect(formatEPS(6.15)).toBe('$6.15')
        })

        it('formats integer 10 as "$10.00"', () => {
            expect(formatEPS(10)).toBe('$10.00')
        })
    })

    // null/undefined
    describe('null/undefined handling', () => {
        it('returns "--" for undefined', () => {
            expect(formatEPS(undefined)).toBe('--')
        })

        it('returns "--" for null (cast)', () => {
            expect(formatEPS(null as unknown as undefined)).toBe('--')
        })
    })
})

// ─── formatDividendYield ───

describe('formatDividendYield', () => {
    // T11-13: Normal value
    describe('T11-13: Normal values', () => {
        it('formats 0.025 as "2.50%"', () => {
            expect(formatDividendYield(0.025)).toBe('2.50%')
        })

        it('formats 0.005 as "0.50%"', () => {
            expect(formatDividendYield(0.005)).toBe('0.50%')
        })

        it('formats 0.1 as "10.00%"', () => {
            expect(formatDividendYield(0.1)).toBe('10.00%')
        })
    })

    // null/undefined
    describe('null/undefined handling', () => {
        it('returns "--" for undefined', () => {
            expect(formatDividendYield(undefined)).toBe('--')
        })

        it('returns "--" for null (cast)', () => {
            expect(formatDividendYield(null as unknown as undefined)).toBe('--')
        })
    })
})
