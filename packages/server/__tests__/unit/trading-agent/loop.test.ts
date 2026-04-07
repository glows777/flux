/**
 * Unit tests for trading-agent loop utilities
 *
 * Tests the remaining exported functions after the refactor:
 * - loadOrCreateBaseline
 * - getMarketStatus
 */

import { describe, expect, it, mock } from 'bun:test'
import { BASELINE_KEY } from '@/core/trading-agent/types'
import { loadOrCreateBaseline, getMarketStatus } from '@/core/trading-agent/loop'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDb(baselineValue: string | null = '100000') {
    return {
        tradingAgentConfig: {
            findUnique: mock(async () =>
                baselineValue !== null ? { key: BASELINE_KEY, value: baselineValue } : null,
            ),
            create: mock(async (args: { data: { key: string; value: string } }) => ({
                key: args.data.key,
                value: args.data.value,
            })),
        },
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('loadOrCreateBaseline', () => {
    it('returns existing baseline value from DB', async () => {
        const db = makeDb('98000')
        const result = await loadOrCreateBaseline(
            db as any,
            105_000,
        )
        expect(result).toBe(98_000)
        expect(db.tradingAgentConfig.create).not.toHaveBeenCalled()
    })

    it('creates baseline with currentEquity when not found', async () => {
        const db = makeDb(null)
        const result = await loadOrCreateBaseline(
            db as any,
            105_000,
        )
        expect(result).toBe(105_000)
        expect(db.tradingAgentConfig.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { key: BASELINE_KEY, value: '105000' },
            }),
        )
    })
})

describe('getMarketStatus', () => {
    it('returns a non-empty string', () => {
        const status = getMarketStatus()
        expect(typeof status).toBe('string')
        expect(status.length).toBeGreaterThan(0)
    })

    it('returns one of the expected market status values', () => {
        const valid = ['盘前', '开盘', '收盘前', '盘后', '休市（周末）', '休市']
        const status = getMarketStatus()
        expect(valid).toContain(status)
    })
})
