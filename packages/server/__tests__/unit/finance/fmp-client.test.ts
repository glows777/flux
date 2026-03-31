/**
 * Phase 3 Step 2: FMP Client Unit Tests
 *
 * Test scenarios:
 * - fmpRequest: URL construction, 10s timeout, Zod validation, HTTP error mapping
 * - getIncomeStatements: correct endpoint + params
 * - getEarningsSurprises: correct endpoint
 * - getCashFlowStatement: correct endpoint + params
 * - getBalanceSheet: correct endpoint + params
 * - getTranscript: correct endpoint + params
 * - getProfile: correct endpoint
 * - Error mapping: 401/403→CONFIG_ERROR, 429→RATE_LIMITED, 404→NOT_FOUND, 5xx→API_ERROR
 * - No API key → CONFIG_ERROR
 * - Zod validation failure → PARSE_ERROR
 * - Network error → API_ERROR
 */

import { describe, expect, it } from 'bun:test'
import type { FmpClientDeps } from '@/core/finance/fmp-client'
import {
    FMP_BASE_URL,
    getBalanceSheet,
    getCashFlowStatement,
    getEarningsSurprises,
    getIncomeStatements,
    getProfile,
    getTranscript,
} from '@/core/finance/fmp-client'
import { FmpError } from '@/core/finance/types'

// ─── Test Helpers ───

function createMockFetch(body: unknown, status = 200): FmpClientDeps['fetch'] {
    return async () =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        })
}

function createMockDeps(body: unknown, status = 200): FmpClientDeps {
    return {
        fetch: createMockFetch(body, status),
        apiKey: 'test-api-key',
    }
}

/** Creates deps where fetch captures the requested URL for assertion */
function createCapturingDeps(body: unknown): { deps: FmpClientDeps; getCapturedUrl: () => string | null } {
    let capturedUrl: string | null = null
    const deps: FmpClientDeps = {
        fetch: async (url: string) => {
            capturedUrl = url
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        },
        apiKey: 'test-api-key',
    }
    return { deps, getCapturedUrl: () => capturedUrl }
}

// ─── Mock Data ───

const MOCK_INCOME_STATEMENTS = [
    {
        date: '2024-09-28',
        period: 'Q3',
        fiscalYear: '2024',
        filingDate: '2024-10-31',
        revenue: 94930000000,
        grossProfit: 43879000000,
        operatingIncome: 29592000000,
        netIncome: 23636000000,
        eps: 1.64,
    },
]

const MOCK_EARNINGS_SURPRISES = [
    {
        date: '2024-10-31',
        epsActual: 1.64,
        epsEstimated: 1.55,
        revenueActual: 94930000000,
        revenueEstimated: 89500000000,
    },
]

const MOCK_CASH_FLOW = [
    {
        date: '2024-09-28',
        freeCashFlow: 26810000000,
    },
]

const MOCK_BALANCE_SHEET = [
    {
        date: '2024-09-28',
        totalDebt: 104590000000,
        totalAssets: 364980000000,
    },
]

const MOCK_TRANSCRIPT = [
    {
        quarter: 3,
        year: 2024,
        content: 'Good afternoon, everyone. Welcome to Apple Q3 2024 earnings call...',
    },
]

const MOCK_PROFILE = [
    {
        companyName: 'Apple Inc.',
        symbol: 'AAPL',
    },
]

// ─── URL Construction ───

describe('FMP Client — URL Construction', () => {
    it('uses the correct base URL', () => {
        expect(FMP_BASE_URL).toBe('https://financialmodelingprep.com/stable')
    })

    it('constructs correct URL for income statements', async () => {
        const { deps, getCapturedUrl } = createCapturingDeps(MOCK_INCOME_STATEMENTS)
        await getIncomeStatements('AAPL', 5, deps)
        const url = getCapturedUrl()!
        expect(url).toContain('/income-statement')
        expect(url).toContain('period=quarter')
        expect(url).toContain('limit=5')
        expect(url).toContain('apikey=test-api-key')
    })

    it('constructs correct URL for earnings surprises', async () => {
        const { deps, getCapturedUrl } = createCapturingDeps(MOCK_EARNINGS_SURPRISES)
        await getEarningsSurprises('AAPL', deps)
        const url = getCapturedUrl()!
        expect(url).toContain('/earnings')
        expect(url).toContain('apikey=test-api-key')
    })

    it('constructs correct URL for cash flow statement', async () => {
        const { deps, getCapturedUrl } = createCapturingDeps(MOCK_CASH_FLOW)
        await getCashFlowStatement('AAPL', 1, deps)
        const url = getCapturedUrl()!
        expect(url).toContain('/cash-flow-statement')
        expect(url).toContain('period=quarter')
        expect(url).toContain('limit=1')
    })

    it('constructs correct URL for balance sheet', async () => {
        const { deps, getCapturedUrl } = createCapturingDeps(MOCK_BALANCE_SHEET)
        await getBalanceSheet('AAPL', 1, deps)
        const url = getCapturedUrl()!
        expect(url).toContain('/balance-sheet-statement')
        expect(url).toContain('period=quarter')
        expect(url).toContain('limit=1')
    })

    it('constructs correct URL for transcript', async () => {
        const { deps, getCapturedUrl } = createCapturingDeps(MOCK_TRANSCRIPT)
        await getTranscript('AAPL', 2024, 3, deps)
        const url = getCapturedUrl()!
        expect(url).toContain('/earning-call-transcript')
        expect(url).toContain('quarter=3')
        expect(url).toContain('year=2024')
    })

    it('constructs correct URL for profile', async () => {
        const { deps, getCapturedUrl } = createCapturingDeps(MOCK_PROFILE)
        await getProfile('AAPL', deps)
        const url = getCapturedUrl()!
        expect(url).toContain('/profile')
        expect(url).toContain('apikey=test-api-key')
    })
})

// ─── Successful Requests ───

describe('FMP Client — Successful Requests', () => {
    it('getIncomeStatements returns parsed income statements', async () => {
        const deps = createMockDeps(MOCK_INCOME_STATEMENTS)
        const result = await getIncomeStatements('AAPL', 5, deps)
        expect(result).toHaveLength(1)
        expect(result[0].revenue).toBe(94930000000)
        expect(result[0].eps).toBe(1.64)
        expect(result[0].period).toBe('Q3')
    })

    it('getIncomeStatements defaults limit to 5', async () => {
        const { deps, getCapturedUrl } = createCapturingDeps(MOCK_INCOME_STATEMENTS)
        await getIncomeStatements('AAPL', undefined, deps)
        expect(getCapturedUrl()!).toContain('limit=5')
    })

    it('getEarningsSurprises returns parsed earnings surprises', async () => {
        const deps = createMockDeps(MOCK_EARNINGS_SURPRISES)
        const result = await getEarningsSurprises('AAPL', deps)
        expect(result).toHaveLength(1)
        expect(result[0].epsActual).toBe(1.64)
        expect(result[0].epsEstimated).toBe(1.55)
    })

    it('getCashFlowStatement returns parsed cash flow', async () => {
        const deps = createMockDeps(MOCK_CASH_FLOW)
        const result = await getCashFlowStatement('AAPL', 1, deps)
        expect(result).toHaveLength(1)
        expect(result[0].freeCashFlow).toBe(26810000000)
    })

    it('getBalanceSheet returns parsed balance sheet', async () => {
        const deps = createMockDeps(MOCK_BALANCE_SHEET)
        const result = await getBalanceSheet('AAPL', 1, deps)
        expect(result).toHaveLength(1)
        expect(result[0].totalDebt).toBe(104590000000)
        expect(result[0].totalAssets).toBe(364980000000)
    })

    it('getTranscript returns parsed transcript', async () => {
        const deps = createMockDeps(MOCK_TRANSCRIPT)
        const result = await getTranscript('AAPL', 2024, 3, deps)
        expect(result).toHaveLength(1)
        expect(result[0].quarter).toBe(3)
        expect(result[0].year).toBe(2024)
        expect(result[0].content).toContain('Q3 2024')
    })

    it('getProfile returns parsed profile', async () => {
        const deps = createMockDeps(MOCK_PROFILE)
        const result = await getProfile('AAPL', deps)
        expect(result).toHaveLength(1)
        expect(result[0].companyName).toBe('Apple Inc.')
        expect(result[0].symbol).toBe('AAPL')
    })

    it('strips extra fields from FMP response', async () => {
        const extendedData = [{ ...MOCK_INCOME_STATEMENTS[0], extraField: 'should be stripped' }]
        const deps = createMockDeps(extendedData)
        const result = await getIncomeStatements('AAPL', 5, deps)
        expect('extraField' in result[0]).toBe(false)
    })

    it('handles empty array response', async () => {
        const deps = createMockDeps([])
        const result = await getIncomeStatements('UNKNOWN', 5, deps)
        expect(result).toHaveLength(0)
    })
})

// ─── HTTP Error Mapping ───

describe('FMP Client — HTTP Error Mapping', () => {
    it('maps HTTP 401 to CONFIG_ERROR', async () => {
        const deps = createMockDeps({ message: 'Unauthorized' }, 401)
        try {
            await getProfile('AAPL', deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('CONFIG_ERROR')
        }
    })

    it('maps HTTP 403 to CONFIG_ERROR', async () => {
        const deps = createMockDeps({ message: 'Forbidden' }, 403)
        try {
            await getProfile('AAPL', deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('CONFIG_ERROR')
        }
    })

    it('maps HTTP 429 to RATE_LIMITED', async () => {
        const deps = createMockDeps({ message: 'Too Many Requests' }, 429)
        try {
            await getProfile('AAPL', deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('RATE_LIMITED')
        }
    })

    it('maps HTTP 404 to NOT_FOUND', async () => {
        const deps = createMockDeps({ message: 'Not Found' }, 404)
        try {
            await getProfile('UNKNOWN', deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('NOT_FOUND')
        }
    })

    it('maps HTTP 500 to API_ERROR', async () => {
        const deps = createMockDeps({ message: 'Internal Server Error' }, 500)
        try {
            await getProfile('AAPL', deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('API_ERROR')
        }
    })

    it('maps HTTP 502 to API_ERROR', async () => {
        const deps = createMockDeps({ message: 'Bad Gateway' }, 502)
        try {
            await getProfile('AAPL', deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('API_ERROR')
        }
    })

    it('includes HTTP status in error message', async () => {
        const deps = createMockDeps({ message: 'Not Found' }, 404)
        try {
            await getProfile('AAPL', deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).message).toContain('404')
        }
    })
})

// ─── Zod Validation Errors ───

describe('FMP Client — Zod Validation', () => {
    it('throws PARSE_ERROR when response items fail schema validation', async () => {
        const invalidData = [{ date: '2024-09-28', revenue: 'not-a-number' }]
        const deps = createMockDeps(invalidData)
        try {
            await getIncomeStatements('AAPL', 5, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('PARSE_ERROR')
        }
    })

    it('throws PARSE_ERROR when response is not an array', async () => {
        const deps = createMockDeps({ error: 'not an array' })
        try {
            await getIncomeStatements('AAPL', 5, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('PARSE_ERROR')
        }
    })

    it('throws PARSE_ERROR for transcript with empty content', async () => {
        const invalidTranscript = [{ quarter: 3, year: 2024, content: '' }]
        const deps = createMockDeps(invalidTranscript)
        try {
            await getTranscript('AAPL', 2024, 3, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('PARSE_ERROR')
        }
    })
})

// ─── Network Errors ───

describe('FMP Client — Network Errors', () => {
    it('throws API_ERROR on fetch rejection (network failure)', async () => {
        const deps: FmpClientDeps = {
            fetch: async () => {
                throw new Error('ECONNREFUSED')
            },
            apiKey: 'test-api-key',
        }
        try {
            await getProfile('AAPL', deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('API_ERROR')
            expect((error as FmpError).message).toContain('ECONNREFUSED')
        }
    })

    it('throws API_ERROR on timeout (AbortError)', async () => {
        const deps: FmpClientDeps = {
            fetch: async () => {
                throw new DOMException('The operation was aborted', 'AbortError')
            },
            apiKey: 'test-api-key',
        }
        try {
            await getProfile('AAPL', deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('API_ERROR')
        }
    })
})

// ─── Config Errors ───

describe('FMP Client — Config Errors', () => {
    it('throws CONFIG_ERROR when apiKey is empty string', async () => {
        const deps: FmpClientDeps = {
            fetch: createMockFetch(MOCK_PROFILE),
            apiKey: '',
        }
        try {
            await getProfile('AAPL', deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(FmpError)
            expect((error as FmpError).code).toBe('CONFIG_ERROR')
        }
    })
})
