/**
 * Phase 3 Step 1: Quarter Utility Unit Tests
 *
 * Test scenarios:
 * - getQuarterFromDate: date → { year, quarter }
 * - getQuarterKey: (year, quarter) → "2024-Q3"
 * - getCurrentQuarter: returns current quarter
 * - getAvailableQuarters: returns last N quarters
 * - isEarningsCacheExpired: reportDate + 100d threshold
 */

import { describe, expect, it } from 'bun:test'
import {
    getAvailableQuarters,
    getCurrentQuarter,
    getQuarterFromDate,
    getQuarterKey,
    isEarningsCacheExpired,
} from '@/core/finance/quarter-utils'

// ─── getQuarterFromDate ───

describe('getQuarterFromDate', () => {
    describe('Q1: January - March', () => {
        it('maps January 1st to Q1', () => {
            expect(getQuarterFromDate(new Date('2024-01-01'))).toEqual({ year: 2024, quarter: 1 })
        })

        it('maps March 31st to Q1', () => {
            expect(getQuarterFromDate(new Date('2024-03-31'))).toEqual({ year: 2024, quarter: 1 })
        })

        it('maps February 15th to Q1', () => {
            expect(getQuarterFromDate(new Date('2025-02-15'))).toEqual({ year: 2025, quarter: 1 })
        })
    })

    describe('Q2: April - June', () => {
        it('maps April 1st to Q2', () => {
            expect(getQuarterFromDate(new Date('2024-04-01'))).toEqual({ year: 2024, quarter: 2 })
        })

        it('maps June 30th to Q2', () => {
            expect(getQuarterFromDate(new Date('2024-06-30'))).toEqual({ year: 2024, quarter: 2 })
        })
    })

    describe('Q3: July - September', () => {
        it('maps July 1st to Q3', () => {
            expect(getQuarterFromDate(new Date('2024-07-01'))).toEqual({ year: 2024, quarter: 3 })
        })

        it('maps September 30th to Q3', () => {
            expect(getQuarterFromDate(new Date('2024-09-30'))).toEqual({ year: 2024, quarter: 3 })
        })
    })

    describe('Q4: October - December', () => {
        it('maps October 1st to Q4', () => {
            expect(getQuarterFromDate(new Date('2024-10-01'))).toEqual({ year: 2024, quarter: 4 })
        })

        it('maps December 31st to Q4', () => {
            expect(getQuarterFromDate(new Date('2024-12-31'))).toEqual({ year: 2024, quarter: 4 })
        })
    })
})

// ─── getQuarterKey ───

describe('getQuarterKey', () => {
    it('formats as "YYYY-QN"', () => {
        expect(getQuarterKey(2024, 3)).toBe('2024-Q3')
    })

    it('formats Q1', () => {
        expect(getQuarterKey(2025, 1)).toBe('2025-Q1')
    })

    it('formats Q4', () => {
        expect(getQuarterKey(2023, 4)).toBe('2023-Q4')
    })
})

// ─── getCurrentQuarter ───

describe('getCurrentQuarter', () => {
    it('returns an object with year and quarter', () => {
        const result = getCurrentQuarter()
        expect(result).toHaveProperty('year')
        expect(result).toHaveProperty('quarter')
    })

    it('returns a valid quarter (1-4)', () => {
        const { quarter } = getCurrentQuarter()
        expect(quarter).toBeGreaterThanOrEqual(1)
        expect(quarter).toBeLessThanOrEqual(4)
    })

    it('returns a reasonable year', () => {
        const { year } = getCurrentQuarter()
        expect(year).toBeGreaterThanOrEqual(2024)
        expect(year).toBeLessThanOrEqual(2030)
    })

    it('matches getQuarterFromDate(new Date())', () => {
        const current = getCurrentQuarter()
        const fromDate = getQuarterFromDate(new Date())
        expect(current).toEqual(fromDate)
    })
})

// ─── getAvailableQuarters ───

describe('getAvailableQuarters', () => {
    it('returns the requested number of quarters', () => {
        const quarters = getAvailableQuarters(8)
        expect(quarters).toHaveLength(8)
    })

    it('returns quarters in reverse chronological order', () => {
        const quarters = getAvailableQuarters(4)
        // First item should be the most recent
        for (let i = 0; i < quarters.length - 1; i++) {
            const current = quarters[i]
            const next = quarters[i + 1]
            const currentVal = current.year * 4 + current.quarter
            const nextVal = next.year * 4 + next.quarter
            expect(currentVal).toBeGreaterThan(nextVal)
        }
    })

    it('wraps year correctly across Q1 → previous year Q4', () => {
        const quarters = getAvailableQuarters(8)
        // Should contain at least one year transition
        const years = new Set(quarters.map((q) => q.year))
        expect(years.size).toBeGreaterThanOrEqual(2)
    })

    it('each quarter has year, quarter, and key', () => {
        const quarters = getAvailableQuarters(1)
        const q = quarters[0]
        expect(q).toHaveProperty('year')
        expect(q).toHaveProperty('quarter')
        expect(q).toHaveProperty('key')
        expect(q.key).toBe(getQuarterKey(q.year, q.quarter))
    })

    it('defaults to 8 quarters when count not provided', () => {
        const quarters = getAvailableQuarters()
        expect(quarters).toHaveLength(8)
    })
})

// ─── isEarningsCacheExpired ───

describe('isEarningsCacheExpired', () => {
    const HUNDRED_DAYS_MS = 100 * 24 * 60 * 60 * 1000

    it('returns false when reportDate is within 100 days', () => {
        const recentDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000) // 50 days ago
        expect(isEarningsCacheExpired(recentDate)).toBe(false)
    })

    it('returns true when reportDate is more than 100 days ago', () => {
        const oldDate = new Date(Date.now() - 110 * 24 * 60 * 60 * 1000) // 110 days ago
        expect(isEarningsCacheExpired(oldDate)).toBe(true)
    })

    it('returns false when reportDate is just within the boundary', () => {
        // 99 days ago — safely within the 100-day window, no race condition
        const withinBoundary = new Date(Date.now() - 99 * 24 * 60 * 60 * 1000)
        expect(isEarningsCacheExpired(withinBoundary)).toBe(false)
    })

    it('returns true when reportDate is past the boundary', () => {
        // 101 days ago — safely past the 100-day window
        const pastBoundary = new Date(Date.now() - 101 * 24 * 60 * 60 * 1000)
        expect(isEarningsCacheExpired(pastBoundary)).toBe(true)
    })

    it('returns false for a very recent reportDate (today)', () => {
        expect(isEarningsCacheExpired(new Date())).toBe(false)
    })

    it('returns true for a very old reportDate (1 year ago)', () => {
        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
        expect(isEarningsCacheExpired(oneYearAgo)).toBe(true)
    })

    it('accepts ISO date string input', () => {
        const recentDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000)
        expect(isEarningsCacheExpired(recentDate.toISOString())).toBe(false)
    })
})
