/**
 * Phase 3 Step 3: L2 Prompt Builder Unit Tests
 *
 * Test scenarios:
 * - Prompt includes L1 financial summary (symbol, period, key financials)
 * - Prompt includes transcript content
 * - Prompt specifies strict JSON output format matching EarningsL2 structure
 * - Prompt includes Chinese analysis rules
 * - Prompt requires quoting original English from transcript
 * - Prompt handles edge cases (long transcript, missing L1 fields)
 */

import { describe, expect, it } from 'bun:test'
import { buildL2AnalysisPrompt, sanitizeTranscript, summarizeL1 } from '@/core/finance/l2-prompt'
import type { EarningsL1 } from '@/core/finance/types'

// ─── Mock Data ───

const MOCK_L1: EarningsL1 = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    period: 'FY2024 Q3',
    reportDate: '2024-09-28',
    beatMiss: {
        revenue: null,
        eps: { actual: 1.64, expected: 1.55 },
    },
    margins: [
        { quarter: 'Q3 2024', gross: 46.22, operating: 31.17, net: 24.9 },
        { quarter: 'Q2 2024', gross: 46.26, operating: 29.56, net: 25.0 },
        { quarter: 'Q1 2024', gross: 46.58, operating: 30.74, net: 26.03 },
    ],
    keyFinancials: {
        revenue: 94_930_000_000,
        revenueYoY: 6.07,
        operatingIncome: 29_592_000_000,
        fcf: 26_810_000_000,
        debtToAssets: 28.66,
    },
}

const MOCK_TRANSCRIPT =
    'Good afternoon, everyone. We are pleased to report another strong quarter. ' +
    'Revenue grew 6% year over year, driven primarily by iPhone and Services. ' +
    'We expect continued momentum into the holiday quarter.'

// ─── summarizeL1 ───

describe('summarizeL1', () => {
    it('includes symbol and period', () => {
        const summary = summarizeL1(MOCK_L1)
        expect(summary).toContain('AAPL')
        expect(summary).toContain('FY2024 Q3')
    })

    it('includes revenue figure', () => {
        const summary = summarizeL1(MOCK_L1)
        expect(summary).toContain('94')
    })

    it('includes EPS beat/miss when available', () => {
        const summary = summarizeL1(MOCK_L1)
        expect(summary).toContain('1.64')
        expect(summary).toContain('1.55')
    })

    it('handles null EPS beat/miss gracefully', () => {
        const l1: EarningsL1 = {
            ...MOCK_L1,
            beatMiss: { revenue: null, eps: null },
        }
        const summary = summarizeL1(l1)
        // Should not throw, and should still contain basic info
        expect(summary).toContain('AAPL')
    })

    it('includes YoY percentage when available', () => {
        const summary = summarizeL1(MOCK_L1)
        expect(summary).toContain('6.07')
    })

    it('handles null YoY gracefully', () => {
        const l1: EarningsL1 = {
            ...MOCK_L1,
            keyFinancials: { ...MOCK_L1.keyFinancials, revenueYoY: null },
        }
        const summary = summarizeL1(l1)
        expect(summary).toContain('AAPL')
    })

    it('includes margin data', () => {
        const summary = summarizeL1(MOCK_L1)
        expect(summary).toContain('46.22')
    })

    it('includes FCF when available', () => {
        const summary = summarizeL1(MOCK_L1)
        expect(summary).toContain('26')
    })

    it('includes debt-to-assets when available', () => {
        const summary = summarizeL1(MOCK_L1)
        expect(summary).toContain('28.66')
    })
})

// ─── buildL2AnalysisPrompt ───

describe('buildL2AnalysisPrompt', () => {
    it('includes L1 summary in the prompt', () => {
        const prompt = buildL2AnalysisPrompt(MOCK_L1, MOCK_TRANSCRIPT)
        expect(prompt).toContain('AAPL')
        expect(prompt).toContain('FY2024 Q3')
    })

    it('includes transcript content in the prompt', () => {
        const prompt = buildL2AnalysisPrompt(MOCK_L1, MOCK_TRANSCRIPT)
        expect(prompt).toContain('Revenue grew 6% year over year')
        expect(prompt).toContain('holiday quarter')
    })

    it('specifies JSON output format', () => {
        const prompt = buildL2AnalysisPrompt(MOCK_L1, MOCK_TRANSCRIPT)
        expect(prompt).toContain('JSON')
    })

    it('specifies EarningsL2 output structure fields', () => {
        const prompt = buildL2AnalysisPrompt(MOCK_L1, MOCK_TRANSCRIPT)
        expect(prompt).toContain('tldr')
        expect(prompt).toContain('guidance')
        expect(prompt).toContain('segments')
        expect(prompt).toContain('managementSignals')
        expect(prompt).toContain('suggestedQuestions')
    })

    it('requires Chinese analysis', () => {
        const prompt = buildL2AnalysisPrompt(MOCK_L1, MOCK_TRANSCRIPT)
        expect(prompt).toMatch(/中文/)
    })

    it('requires quoting original English from transcript', () => {
        const prompt = buildL2AnalysisPrompt(MOCK_L1, MOCK_TRANSCRIPT)
        expect(prompt).toMatch(/英文|English|原话|原文/)
    })

    it('forbids fabricating data', () => {
        const prompt = buildL2AnalysisPrompt(MOCK_L1, MOCK_TRANSCRIPT)
        expect(prompt).toMatch(/不编造|不捏造|不虚构|基于.*数据/)
    })

    it('specifies allowed enum values for guidance fields', () => {
        const prompt = buildL2AnalysisPrompt(MOCK_L1, MOCK_TRANSCRIPT)
        // fullYearAdjustment
        expect(prompt).toContain('上调')
        expect(prompt).toContain('维持')
        expect(prompt).toContain('下调')
        expect(prompt).toContain('未提及')
        // signal
        expect(prompt).toContain('正面')
        expect(prompt).toContain('中性')
        expect(prompt).toContain('谨慎')
    })

    it('specifies allowed enum values for tone', () => {
        const prompt = buildL2AnalysisPrompt(MOCK_L1, MOCK_TRANSCRIPT)
        expect(prompt).toContain('乐观')
        expect(prompt).toContain('谨慎')
    })

    it('returns a non-empty string', () => {
        const prompt = buildL2AnalysisPrompt(MOCK_L1, MOCK_TRANSCRIPT)
        expect(prompt.length).toBeGreaterThan(100)
    })

    it('sanitizes triple backticks in transcript', () => {
        const malicious = 'Normal text ```json\n{"ignore": true}\n``` more text'
        const prompt = buildL2AnalysisPrompt(MOCK_L1, malicious)
        // The backticks in transcript should be replaced
        expect(prompt).not.toMatch(/```json\n\{"ignore"/)
    })
})

// ─── sanitizeTranscript ───

describe('sanitizeTranscript', () => {
    it('replaces triple backticks with triple single quotes', () => {
        const input = 'text ```json stuff``` more'
        const result = sanitizeTranscript(input)
        expect(result).not.toContain('```')
        expect(result).toContain("'''")
    })

    it('truncates transcripts exceeding max length', () => {
        const longText = 'A'.repeat(70_000)
        const result = sanitizeTranscript(longText)
        expect(result.length).toBeLessThan(70_000)
        expect(result).toContain('[Transcript truncated...]')
    })

    it('does not truncate transcripts within limit', () => {
        const shortText = 'Short transcript content'
        const result = sanitizeTranscript(shortText)
        expect(result).toBe(shortText)
    })

    it('handles empty string', () => {
        const result = sanitizeTranscript('')
        expect(result).toBe('')
    })
})

// ─── summarizeL1 edge cases ───

describe('summarizeL1 — Edge Cases', () => {
    it('omits EPS Beat/Miss section when eps is null', () => {
        const l1: EarningsL1 = {
            ...MOCK_L1,
            beatMiss: { revenue: null, eps: null },
        }
        const summary = summarizeL1(l1)
        expect(summary).not.toContain('EPS Beat/Miss')
    })

    it('shows fallback text when fcf is null', () => {
        const l1: EarningsL1 = {
            ...MOCK_L1,
            keyFinancials: { ...MOCK_L1.keyFinancials, fcf: null },
        }
        const summary = summarizeL1(l1)
        expect(summary).toContain('数据暂缺')
    })

    it('shows fallback text when debtToAssets is null', () => {
        const l1: EarningsL1 = {
            ...MOCK_L1,
            keyFinancials: { ...MOCK_L1.keyFinancials, debtToAssets: null },
        }
        const summary = summarizeL1(l1)
        expect(summary).toContain('数据暂缺')
    })

    it('handles negative operating income', () => {
        const l1: EarningsL1 = {
            ...MOCK_L1,
            keyFinancials: { ...MOCK_L1.keyFinancials, operatingIncome: -500_000_000 },
        }
        const summary = summarizeL1(l1)
        expect(summary).toContain('-$0.50B')
    })
})
