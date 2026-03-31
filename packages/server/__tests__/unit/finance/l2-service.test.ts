/**
 * Phase 3 Step 3: L2 Service Unit Tests
 *
 * Test scenarios:
 * - Happy path: transcript + AI → valid EarningsL2
 * - JSON parsing: strips markdown code fences (```json ... ```)
 * - No transcript: FmpError NOT_FOUND
 * - AI failure: propagates error
 * - Invalid JSON from AI: throws PARSE_ERROR
 * - Zod validation failure: throws PARSE_ERROR
 * - Calls AI with correct options (maxTokens, temperature)
 * - Passes L1 data into prompt
 */

import { mock, describe, expect, it, beforeEach } from 'bun:test'

// Mock 'ai' module BEFORE any import that touches it
const mockGenerateText = mock()
mock.module('ai', () => ({ generateText: mockGenerateText }))

import type { L2ServiceDeps } from '@/core/finance/l2-service'
import { getEarningsL2, stripCodeFences } from '@/core/finance/l2-service'
import type { EarningsL1, EarningsL2, FmpTranscript } from '@/core/finance/types'
import { FmpError } from '@/core/finance/types'

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
    ],
    keyFinancials: {
        revenue: 94_930_000_000,
        revenueYoY: 6.07,
        operatingIncome: 29_592_000_000,
        fcf: 26_810_000_000,
        debtToAssets: 28.66,
    },
}

const MOCK_TRANSCRIPT: FmpTranscript = {
    quarter: 3,
    year: 2024,
    content:
        'Good afternoon, everyone. Revenue grew 6% year over year. ' +
        'We expect continued momentum into the holiday quarter. ' +
        'Services revenue reached an all-time high of $24.2 billion.',
}

const MOCK_L2_RESPONSE: EarningsL2 = {
    symbol: 'AAPL',
    period: 'FY2024 Q3',
    tldr: 'Apple 第三季度营收同比增长 6%，EPS 超预期。服务业务创历史新高。',
    guidance: {
        nextQuarterRevenue: '管理层暗示假日季将保持增长势头',
        fullYearAdjustment: '维持',
        keyQuote: 'We expect continued momentum into the holiday quarter.',
        signal: '正面',
    },
    segments: [
        {
            name: 'Services',
            value: '$24.2B',
            yoy: '+15%',
            comment: '创历史新高，成为增长主力',
        },
    ],
    managementSignals: {
        tone: '乐观',
        keyPhrases: ['continued momentum', 'all-time high'],
        quotes: [
            {
                en: 'Services revenue reached an all-time high of $24.2 billion.',
                cn: '服务业务营收达到历史新高的 242 亿美元。',
            },
        ],
        analystFocus: ['服务业务增长可持续性', '中国市场表现'],
    },
    suggestedQuestions: [
        'iPhone 在中国市场的表现如何？',
        '服务业务的毛利率趋势是什么？',
    ],
}

// ─── Helpers ───

function createMockDeps(overrides?: Partial<L2ServiceDeps>): L2ServiceDeps {
    return {
        getTranscript: async () => [MOCK_TRANSCRIPT],
        model: { modelId: 'mock-model' } as unknown as import('ai').LanguageModel,
        ...overrides,
    }
}

// ─── stripCodeFences ───

describe('stripCodeFences', () => {
    it('strips ```json ... ``` fences', () => {
        const input = '```json\n{"key": "value"}\n```'
        expect(stripCodeFences(input)).toBe('{"key": "value"}')
    })

    it('strips ``` ... ``` fences without language tag', () => {
        const input = '```\n{"key": "value"}\n```'
        expect(stripCodeFences(input)).toBe('{"key": "value"}')
    })

    it('returns input unchanged if no fences', () => {
        const input = '{"key": "value"}'
        expect(stripCodeFences(input)).toBe('{"key": "value"}')
    })

    it('handles fences with extra whitespace', () => {
        const input = '  ```json  \n  {"key": "value"}  \n  ```  '
        const result = stripCodeFences(input)
        expect(result).toContain('"key"')
    })

    it('handles content before and after fences', () => {
        const input = 'Here is the result:\n```json\n{"key": "value"}\n```\nDone.'
        const result = stripCodeFences(input)
        expect(result).toContain('"key"')
    })
})

// ─── Happy Path ───

describe('getEarningsL2 — Happy Path', () => {
    beforeEach(() => {
        mockGenerateText.mockResolvedValue({ text: JSON.stringify(MOCK_L2_RESPONSE) })
    })

    it('returns valid EarningsL2 with correct symbol', async () => {
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(result.symbol).toBe('AAPL')
    })

    it('returns correct period', async () => {
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(result.period).toBe('FY2024 Q3')
    })

    it('returns tldr as non-empty string', async () => {
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(result.tldr.length).toBeGreaterThan(0)
    })

    it('returns guidance with valid signal enum', async () => {
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(['正面', '中性', '谨慎']).toContain(result.guidance.signal)
    })

    it('returns guidance with valid fullYearAdjustment enum', async () => {
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(['上调', '维持', '下调', '未提及']).toContain(result.guidance.fullYearAdjustment)
    })

    it('returns segments as array', async () => {
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(Array.isArray(result.segments)).toBe(true)
    })

    it('returns managementSignals with valid tone', async () => {
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(['乐观', '中性', '谨慎']).toContain(result.managementSignals.tone)
    })

    it('returns suggestedQuestions as array', async () => {
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(Array.isArray(result.suggestedQuestions)).toBe(true)
        expect(result.suggestedQuestions.length).toBeGreaterThan(0)
    })
})

// ─── JSON Parsing ───

describe('getEarningsL2 — JSON Parsing', () => {
    it('parses response wrapped in ```json fences', async () => {
        mockGenerateText.mockResolvedValueOnce({
            text: '```json\n' + JSON.stringify(MOCK_L2_RESPONSE) + '\n```',
        })
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(result.symbol).toBe('AAPL')
    })

    it('parses response wrapped in ``` fences (no language tag)', async () => {
        mockGenerateText.mockResolvedValueOnce({
            text: '```\n' + JSON.stringify(MOCK_L2_RESPONSE) + '\n```',
        })
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(result.symbol).toBe('AAPL')
    })

    it('parses raw JSON response (no fences)', async () => {
        mockGenerateText.mockResolvedValueOnce({ text: JSON.stringify(MOCK_L2_RESPONSE) })
        const result = await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(result.symbol).toBe('AAPL')
    })
})

// ─── No Transcript ───

describe('getEarningsL2 — No Transcript', () => {
    beforeEach(() => {
        mockGenerateText.mockResolvedValue({ text: JSON.stringify(MOCK_L2_RESPONSE) })
    })

    it('throws FmpError NOT_FOUND when transcript array is empty', async () => {
        const deps = createMockDeps({
            getTranscript: async () => [],
        })
        try {
            await getEarningsL2('AAPL', 2024, 3, MOCK_L1, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('NOT_FOUND')
        }
    })

    it('propagates FmpError from getTranscript', async () => {
        const deps = createMockDeps({
            getTranscript: async () => {
                throw new FmpError('FMP resource not found (HTTP 404)', 'NOT_FOUND')
            },
        })
        try {
            await getEarningsL2('AAPL', 2024, 3, MOCK_L1, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('NOT_FOUND')
        }
    })

    it('wraps non-FmpError transcript failures as API_ERROR', async () => {
        const deps = createMockDeps({
            getTranscript: async () => {
                throw new TypeError('Network failed')
            },
        })
        try {
            await getEarningsL2('AAPL', 2024, 3, MOCK_L1, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('API_ERROR')
            expect((error as FmpError).message).toContain('Network failed')
        }
    })
})

// ─── AI Failure ───

describe('getEarningsL2 — AI Failure', () => {
    it('throws when AI returns invalid JSON', async () => {
        mockGenerateText.mockResolvedValueOnce({ text: 'This is not JSON at all.' })
        try {
            await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('PARSE_ERROR')
        }
    })

    it('throws when AI returns JSON missing required fields', async () => {
        mockGenerateText.mockResolvedValueOnce({ text: JSON.stringify({ symbol: 'AAPL' }) })
        try {
            await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('PARSE_ERROR')
        }
    })

    it('throws when AI generateText rejects', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('AI service unavailable'))
        try {
            await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('API_ERROR')
        }
    })

    it('throws when AI returns JSON with invalid enum values', async () => {
        const invalidResponse = {
            ...MOCK_L2_RESPONSE,
            guidance: {
                ...MOCK_L2_RESPONSE.guidance,
                fullYearAdjustment: 'INVALID_VALUE',
            },
        }
        mockGenerateText.mockResolvedValueOnce({ text: JSON.stringify(invalidResponse) })
        try {
            await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('PARSE_ERROR')
        }
    })
})

// ─── AI Call Options ───

describe('getEarningsL2 — AI Call Options', () => {
    beforeEach(() => {
        mockGenerateText.mockResolvedValue({ text: JSON.stringify(MOCK_L2_RESPONSE) })
    })

    it('calls generateText with the prompt containing L1 data', async () => {
        mockGenerateText.mockClear()
        mockGenerateText.mockResolvedValueOnce({ text: JSON.stringify(MOCK_L2_RESPONSE) })
        await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(mockGenerateText).toHaveBeenCalledTimes(1)
        const callArgs = mockGenerateText.mock.calls[0][0]
        expect(callArgs.prompt).toContain('AAPL')
        expect(callArgs.prompt).toContain('FY2024 Q3')
    })

    it('calls generateText with the transcript content in prompt', async () => {
        mockGenerateText.mockClear()
        mockGenerateText.mockResolvedValueOnce({ text: JSON.stringify(MOCK_L2_RESPONSE) })
        await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(mockGenerateText).toHaveBeenCalledTimes(1)
        const callArgs = mockGenerateText.mock.calls[0][0]
        expect(callArgs.prompt).toContain('Revenue grew 6% year over year')
    })

    it('calls generateText with low temperature for factual output', async () => {
        mockGenerateText.mockClear()
        mockGenerateText.mockResolvedValueOnce({ text: JSON.stringify(MOCK_L2_RESPONSE) })
        await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(mockGenerateText).toHaveBeenCalledTimes(1)
        const callArgs = mockGenerateText.mock.calls[0][0]
        expect(callArgs.temperature).toBeLessThanOrEqual(0.2)
    })

    it('calls generateText with sufficient maxOutputTokens', async () => {
        mockGenerateText.mockClear()
        mockGenerateText.mockResolvedValueOnce({ text: JSON.stringify(MOCK_L2_RESPONSE) })
        await getEarningsL2('AAPL', 2024, 3, MOCK_L1, createMockDeps())
        expect(mockGenerateText).toHaveBeenCalledTimes(1)
        const callArgs = mockGenerateText.mock.calls[0][0]
        expect(callArgs.maxOutputTokens).toBeGreaterThanOrEqual(4096)
    })
})
