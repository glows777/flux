/**
 * Phase 3: L2 Service Uploaded Transcript Fallback Tests
 *
 * Test scenarios:
 * - FMP succeeds → uses FMP, no fallback call
 * - FMP fails + uploaded exists → uses uploaded transcript
 * - FMP empty + uploaded exists → uses uploaded transcript
 * - FMP fails + no uploaded → throws NOT_FOUND with upload suggestion
 * - FMP fails + uploaded retrieval errors → throws NOT_FOUND (graceful)
 * - Uploaded transcript content is passed to prompt builder
 * - NOT_FOUND message includes upload endpoint hint
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'

const mockGenerateText = mock(() => Promise.resolve({ text: '' }))
mock.module('ai', () => ({ generateText: mockGenerateText }))

import type { L2ServiceDeps } from '@/core/finance/l2-service'
import { getEarningsL2 } from '@/core/finance/l2-service'
import type { EarningsL1, EarningsL2, FmpTranscript } from '@/core/finance/types'
import { FmpError } from '@/core/finance/types'

// ─── Mock Data ───

const MOCK_L1: EarningsL1 = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    period: 'FY2024 Q3',
    reportDate: '2024-09-28',
    beatMiss: { revenue: null, eps: null },
    margins: [],
    keyFinancials: {
        revenue: 94_930_000_000,
        revenueYoY: null,
        operatingIncome: 29_592_000_000,
        fcf: null,
        debtToAssets: null,
    },
}

const MOCK_TRANSCRIPT: FmpTranscript = {
    quarter: 3,
    year: 2024,
    content: 'Revenue grew 6% year over year. We expect continued momentum.',
}

const UPLOADED_TRANSCRIPT =
    'This is a manually uploaded earnings call transcript with management commentary and analyst Q&A.'

const MOCK_L2_RESPONSE: EarningsL2 = {
    symbol: 'AAPL',
    period: 'FY2024 Q3',
    tldr: 'Summary text for testing purposes.',
    guidance: {
        nextQuarterRevenue: '$90B',
        fullYearAdjustment: '维持',
        keyQuote: 'We expect growth.',
        signal: '正面',
    },
    segments: [{ name: 'iPhone', value: '$50B', yoy: '+5%', comment: '增长稳定' }],
    managementSignals: {
        tone: '乐观',
        keyPhrases: ['growth'],
        quotes: [{ en: 'We expect growth.', cn: '我们预期增长。' }],
        analystFocus: ['iPhone'],
    },
    suggestedQuestions: ['Q4 展望？'],
}

// ─── Helpers ───

function createDepsWithFallback(overrides?: Partial<L2ServiceDeps>): L2ServiceDeps {
    mockGenerateText.mockResolvedValue({ text: JSON.stringify(MOCK_L2_RESPONSE) })
    return {
        getTranscript: mock(async () => [MOCK_TRANSCRIPT]),
        model: { modelId: 'mock-model' } as unknown as L2ServiceDeps['model'],
        getUploadedTranscript: mock(async () => UPLOADED_TRANSCRIPT),
        ...overrides,
    }
}

// ─── Tests ───

describe('getEarningsL2 — Uploaded Transcript Fallback', () => {
    beforeEach(() => {
        mockGenerateText.mockClear()
    })

    it('uses FMP transcript when available (no fallback call)', async () => {
        const mockGetUploaded = mock(async () => UPLOADED_TRANSCRIPT)
        const deps = createDepsWithFallback({
            getUploadedTranscript: mockGetUploaded,
        })

        await getEarningsL2('AAPL', 2024, 3, MOCK_L1, deps)

        expect(mockGetUploaded).not.toHaveBeenCalled()
    })

    it('uses uploaded transcript when FMP throws', async () => {
        const deps = createDepsWithFallback({
            getTranscript: mock(async () => {
                throw new FmpError('Not found', 'NOT_FOUND')
            }),
        })

        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, deps)

        expect(result.symbol).toBe('AAPL')
        const capturedPrompt = mockGenerateText.mock.calls[0][0].prompt as string
        expect(capturedPrompt).toContain(UPLOADED_TRANSCRIPT)
    })

    it('uses uploaded transcript when FMP returns empty', async () => {
        const deps = createDepsWithFallback({
            getTranscript: mock(async () => []),
        })

        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, deps)

        expect(result.symbol).toBe('AAPL')
        const capturedPrompt = mockGenerateText.mock.calls[0][0].prompt as string
        expect(capturedPrompt).toContain(UPLOADED_TRANSCRIPT)
    })

    it('throws NOT_FOUND with upload hint when both sources have no data', async () => {
        const deps = createDepsWithFallback({
            getTranscript: mock(async () => {
                throw new FmpError('Not found', 'NOT_FOUND')
            }),
            getUploadedTranscript: mock(async () => null),
        })

        try {
            await getEarningsL2('AAPL', 2024, 3, MOCK_L1, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('NOT_FOUND')
            expect((error as FmpError).message).toContain('upload')
            expect((error as FmpError).message).toContain('PUT')
        }
    })

    it('throws NOT_FOUND when uploaded retrieval errors (graceful)', async () => {
        const deps = createDepsWithFallback({
            getTranscript: mock(async () => {
                throw new Error('Network error')
            }),
            getUploadedTranscript: mock(async () => {
                throw new Error('DB connection failed')
            }),
        })

        try {
            await getEarningsL2('AAPL', 2024, 3, MOCK_L1, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('NOT_FOUND')
        }
    })

    it('passes uploaded transcript content to prompt builder', async () => {
        const deps = createDepsWithFallback({
            getTranscript: mock(async () => []),
        })

        await getEarningsL2('AAPL', 2024, 3, MOCK_L1, deps)

        // Prompt should contain the uploaded transcript and L1 data
        const capturedPrompt = mockGenerateText.mock.calls[0][0].prompt as string
        expect(capturedPrompt).toContain(UPLOADED_TRANSCRIPT)
        expect(capturedPrompt).toContain('AAPL')
        expect(capturedPrompt).toContain('FY2024 Q3')
    })

    it('includes upload endpoint path in NOT_FOUND error message', async () => {
        const deps = createDepsWithFallback({
            getTranscript: mock(async () => []),
            getUploadedTranscript: mock(async () => null),
        })

        try {
            await getEarningsL2('AAPL', 2024, 3, MOCK_L1, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect((error as FmpError).message).toContain('/api/stocks/AAPL/earnings/transcript')
        }
    })
})
