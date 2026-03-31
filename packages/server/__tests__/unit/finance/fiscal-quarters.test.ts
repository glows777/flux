/**
 * Fiscal Quarters Service Unit Tests
 *
 * Test scenarios:
 * - NVDA-style data (non-calendar fiscal year) → correct year/quarter/key/label/date
 * - Standard company (calendar fiscal year) → correct mapping
 * - Empty income statements → returns []
 * - Deduplication: duplicate periods are filtered
 * - Custom limit parameter passed through
 * - Dependency injection works
 */

import { describe, expect, it } from 'bun:test'
import type { FmpClientDeps } from '@/core/finance/fmp-client'
import { getAvailableFiscalQuarters } from '@/core/finance/fiscal-quarters'
import type { FmpIncomeStatement } from '@/core/finance/types'

// ─── Test Helpers ───

function createMockDeps(statements: FmpIncomeStatement[]): FmpClientDeps {
    return {
        fetch: async () =>
            new Response(JSON.stringify(statements), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        apiKey: 'test-api-key',
    }
}

// ─── Test Data ───

/** NVDA fiscal year ends January — fiscal quarters don't align with calendar */
const NVDA_STATEMENTS: FmpIncomeStatement[] = [
    { date: '2025-04-27', period: 'Q1', fiscalYear: '2026', filingDate: '2025-05-28', revenue: 44000000000, grossProfit: 33000000000, operatingIncome: 28000000000, netIncome: 24000000000, eps: 0.96 },
    { date: '2025-01-26', period: 'Q4', fiscalYear: '2025', filingDate: '2025-02-26', revenue: 39000000000, grossProfit: 29000000000, operatingIncome: 24000000000, netIncome: 22000000000, eps: 0.89 },
    { date: '2024-10-27', period: 'Q3', fiscalYear: '2025', filingDate: '2024-11-20', revenue: 35000000000, grossProfit: 26000000000, operatingIncome: 22000000000, netIncome: 19000000000, eps: 0.78 },
    { date: '2024-07-28', period: 'Q2', fiscalYear: '2025', filingDate: '2024-08-28', revenue: 30000000000, grossProfit: 23000000000, operatingIncome: 19000000000, netIncome: 17000000000, eps: 0.68 },
]

/** Standard calendar fiscal year company (e.g., MSFT or AAPL-like) */
const STANDARD_STATEMENTS: FmpIncomeStatement[] = [
    { date: '2025-03-31', period: 'Q1', fiscalYear: '2025', filingDate: '2025-04-30', revenue: 100000000000, grossProfit: 50000000000, operatingIncome: 30000000000, netIncome: 25000000000, eps: 2.0 },
    { date: '2024-12-31', period: 'Q4', fiscalYear: '2024', filingDate: '2025-01-30', revenue: 95000000000, grossProfit: 48000000000, operatingIncome: 28000000000, netIncome: 23000000000, eps: 1.9 },
    { date: '2024-09-30', period: 'Q3', fiscalYear: '2024', filingDate: '2024-10-30', revenue: 90000000000, grossProfit: 45000000000, operatingIncome: 26000000000, netIncome: 21000000000, eps: 1.7 },
]

// ─── Tests ───

describe('getAvailableFiscalQuarters', () => {
    it('transforms NVDA-style (non-calendar fiscal year) data correctly', async () => {
        const deps = createMockDeps(NVDA_STATEMENTS)
        const result = await getAvailableFiscalQuarters('NVDA', { deps })

        expect(result).toHaveLength(4)

        // First result: newest quarter — Q1 FY2026
        expect(result[0]).toEqual({
            year: 2026,
            quarter: 1,
            key: '2026-Q1',
            label: 'FY2026 Q1 (2025-05-28)',
            date: '2025-05-28',
        })

        // Second: Q4 FY2025
        expect(result[1]).toEqual({
            year: 2025,
            quarter: 4,
            key: '2025-Q4',
            label: 'FY2025 Q4 (2025-02-26)',
            date: '2025-02-26',
        })

        // Third: Q3 FY2025
        expect(result[2]).toEqual({
            year: 2025,
            quarter: 3,
            key: '2025-Q3',
            label: 'FY2025 Q3 (2024-11-20)',
            date: '2024-11-20',
        })

        // Fourth: Q2 FY2025
        expect(result[3]).toEqual({
            year: 2025,
            quarter: 2,
            key: '2025-Q2',
            label: 'FY2025 Q2 (2024-08-28)',
            date: '2024-08-28',
        })
    })

    it('transforms standard calendar fiscal year company correctly', async () => {
        const deps = createMockDeps(STANDARD_STATEMENTS)
        const result = await getAvailableFiscalQuarters('AAPL', { deps })

        expect(result).toHaveLength(3)

        expect(result[0]).toEqual({
            year: 2025,
            quarter: 1,
            key: '2025-Q1',
            label: 'FY2025 Q1 (2025-04-30)',
            date: '2025-04-30',
        })

        expect(result[1]).toEqual({
            year: 2024,
            quarter: 4,
            key: '2024-Q4',
            label: 'FY2024 Q4 (2025-01-30)',
            date: '2025-01-30',
        })
    })

    it('returns empty array for empty income statements', async () => {
        const deps = createMockDeps([])
        const result = await getAvailableFiscalQuarters('AAPL', { deps })

        expect(result).toEqual([])
    })

    it('deduplicates by key (same year+quarter)', async () => {
        const duplicateStatements: FmpIncomeStatement[] = [
            { date: '2025-03-31', period: 'Q1', fiscalYear: '2025', filingDate: '2025-04-30', revenue: 100000000000, grossProfit: 50000000000, operatingIncome: 30000000000, netIncome: 25000000000, eps: 2.0 },
            // Duplicate: same period Q1 but different date (restatement scenario)
            { date: '2025-03-15', period: 'Q1', fiscalYear: '2025', filingDate: '2025-04-15', revenue: 99000000000, grossProfit: 49000000000, operatingIncome: 29000000000, netIncome: 24000000000, eps: 1.9 },
            { date: '2024-12-31', period: 'Q4', fiscalYear: '2024', filingDate: '2025-01-30', revenue: 95000000000, grossProfit: 48000000000, operatingIncome: 28000000000, netIncome: 23000000000, eps: 1.9 },
        ]

        const deps = createMockDeps(duplicateStatements)
        const result = await getAvailableFiscalQuarters('AAPL', { deps })

        // Should deduplicate: only 2 unique quarters (Q1 keeps first occurrence)
        expect(result).toHaveLength(2)
        expect(result[0].key).toBe('2025-Q1')
        expect(result[0].date).toBe('2025-04-30') // first occurrence kept (filingDate)
        expect(result[1].key).toBe('2024-Q4')
    })

    it('passes custom limit to getIncomeStatements', async () => {
        let capturedUrl: string | null = null
        const deps: FmpClientDeps = {
            fetch: async (url: string) => {
                capturedUrl = url
                return new Response(JSON.stringify([]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            },
            apiKey: 'test-api-key',
        }

        await getAvailableFiscalQuarters('AAPL', { limit: 12, deps })

        expect(capturedUrl).not.toBeNull()
        const url = new URL(capturedUrl!)
        expect(url.searchParams.get('limit')).toBe('12')
    })

    it('uses default limit of 5 when not specified', async () => {
        let capturedUrl: string | null = null
        const deps: FmpClientDeps = {
            fetch: async (url: string) => {
                capturedUrl = url
                return new Response(JSON.stringify([]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            },
            apiKey: 'test-api-key',
        }

        await getAvailableFiscalQuarters('AAPL', { deps })

        expect(capturedUrl).not.toBeNull()
        const url = new URL(capturedUrl!)
        expect(url.searchParams.get('limit')).toBe('5')
    })

    it('propagates FmpError from client', async () => {
        const deps: FmpClientDeps = {
            fetch: async () =>
                new Response('', { status: 404 }),
            apiKey: 'test-api-key',
        }

        await expect(
            getAvailableFiscalQuarters('INVALID', { deps }),
        ).rejects.toThrow()
    })

    it('extracts quarter number from period string (Q1-Q4)', async () => {
        const statements: FmpIncomeStatement[] = [
            { date: '2024-06-30', period: 'Q2', fiscalYear: '2024', filingDate: '2024-07-30', revenue: 50000000000, grossProfit: 25000000000, operatingIncome: 15000000000, netIncome: 12000000000, eps: 1.0 },
        ]

        const deps = createMockDeps(statements)
        const result = await getAvailableFiscalQuarters('TEST', { deps })

        expect(result[0].quarter).toBe(2)
        expect(result[0].year).toBe(2024)
    })
})
