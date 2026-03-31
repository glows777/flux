import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { FinnhubClient } from '@/core/market-data/common/finnhub-client'

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

function createMockFetch(responseBody: unknown, status = 200) {
    return mock(() =>
        Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(responseBody),
        } as Response),
    )
}

// ---------------------------------------------------------------------------
// getQuote
// ---------------------------------------------------------------------------

describe('FinnhubClient.getQuote', () => {
    test('returns Quote with mapped fields', async () => {
        const mockFetch = createMockFetch({ c: 150.25, dp: 1.5, v: 5000000 })
        const client = new FinnhubClient('test-key', mockFetch)

        const quote = await client.getQuote('AAPL')

        expect(quote.symbol).toBe('AAPL')
        expect(quote.price).toBe(150.25)
        expect(quote.change).toBe(1.5)
        expect(quote.volume).toBe(5000000)
        expect(quote.timestamp).toBeInstanceOf(Date)
    })

    test('preserves volume=0 (nullish coalescing, not falsy check)', async () => {
        const mockFetch = createMockFetch({ c: 100, dp: -0.5, v: 0 })
        const client = new FinnhubClient('test-key', mockFetch)

        const quote = await client.getQuote('TEST')

        expect(quote.volume).toBe(0)
    })

    test('passes api key and symbol as query params', async () => {
        const mockFetch = createMockFetch({ c: 100, dp: 0, v: 1000 })
        const client = new FinnhubClient('my-api-key', mockFetch)

        await client.getQuote('MSFT')

        expect(mockFetch).toHaveBeenCalledTimes(1)
        const calledUrl = (mockFetch.mock.calls[0] as string[])[0]
        expect(calledUrl).toContain('token=my-api-key')
        expect(calledUrl).toContain('symbol=MSFT')
        expect(calledUrl).toContain('/quote')
    })

    test('throws on non-ok response', async () => {
        const mockFetch = createMockFetch({}, 429)
        const client = new FinnhubClient('test-key', mockFetch)

        await expect(client.getQuote('AAPL')).rejects.toThrow(
            'Finnhub /quote failed: 429',
        )
    })
})

// ---------------------------------------------------------------------------
// getDailyHistory
// ---------------------------------------------------------------------------

describe('FinnhubClient.getDailyHistory', () => {
    const candleResponse = {
        s: 'ok',
        t: [1700000000, 1700086400, 1700172800],
        o: [150, 151, 152],
        h: [155, 156, 157],
        l: [148, 149, 150],
        c: [153, 154, 155],
        v: [1000000, 1100000, 1200000],
    }

    test('returns HistoryPoint array from candle data', async () => {
        const mockFetch = createMockFetch(candleResponse)
        const client = new FinnhubClient('test-key', mockFetch)

        const history = await client.getDailyHistory('AAPL', 3)

        expect(history).toHaveLength(3)
        expect(history[0].date).toBeInstanceOf(Date)
        expect(history[0].open).toBe(150)
        expect(history[0].high).toBe(155)
        expect(history[0].low).toBe(148)
        expect(history[0].close).toBe(153)
        expect(history[0].volume).toBe(1000000)
    })

    test('returns empty array when status is not ok', async () => {
        const mockFetch = createMockFetch({ s: 'no_data' })
        const client = new FinnhubClient('test-key', mockFetch)

        const history = await client.getDailyHistory('INVALID', 30)

        expect(history).toEqual([])
    })

    test('returns empty array when t array is missing', async () => {
        const mockFetch = createMockFetch({ s: 'ok' })
        const client = new FinnhubClient('test-key', mockFetch)

        const history = await client.getDailyHistory('EMPTY', 7)

        expect(history).toEqual([])
    })

    test('preserves volume=0 in candle data', async () => {
        const noVolumeResponse = {
            s: 'ok',
            t: [1700000000],
            o: [150],
            h: [155],
            l: [148],
            c: [153],
            v: [0],
        }
        const mockFetch = createMockFetch(noVolumeResponse)
        const client = new FinnhubClient('test-key', mockFetch)

        const history = await client.getDailyHistory('TEST', 1)

        expect(history[0].volume).toBe(0)
    })

    test('passes from/to timestamps and resolution D', async () => {
        const mockFetch = createMockFetch(candleResponse)
        const client = new FinnhubClient('test-key', mockFetch)

        await client.getDailyHistory('AAPL', 30)

        const calledUrl = (mockFetch.mock.calls[0] as string[])[0]
        expect(calledUrl).toContain('/stock/candle')
        expect(calledUrl).toContain('resolution=D')
        expect(calledUrl).toContain('from=')
        expect(calledUrl).toContain('to=')
    })
})

// ---------------------------------------------------------------------------
// getCompanyOverview
// ---------------------------------------------------------------------------

describe('FinnhubClient.getCompanyOverview', () => {
    let mockFetch: ReturnType<typeof mock>
    let client: FinnhubClient

    beforeEach(() => {
        let callCount = 0
        mockFetch = mock(() => {
            callCount++
            // First call: profile2, Second call: metric
            const body =
                callCount === 1
                    ? {
                          ticker: 'AAPL',
                          name: 'Apple Inc',
                          finnhubIndustry: 'Technology',
                      }
                    : {
                          metric: {
                              peBasicExclExtraTTM: 28.5,
                              marketCapitalization: 2500000,
                              epsBasicExclExtraItemsTTM: 6.05,
                              dividendYieldIndicatedAnnual: 0.55,
                          },
                      }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve(body),
            } as Response)
        })
        client = new FinnhubClient('test-key', mockFetch as any)
    })

    test('returns CompanyOverview with profile and metric data', async () => {
        const overview = await client.getCompanyOverview('AAPL')

        expect(overview.symbol).toBe('AAPL')
        expect(overview.name).toBe('Apple Inc')
        expect(overview.sector).toBe('Technology')
        expect(overview.pe).toBe(28.5)
        expect(overview.marketCap).toBe(2500000 * 1_000_000)
        expect(overview.eps).toBe(6.05)
        expect(overview.dividendYield).toBe(0.55)
    })

    test('makes two parallel requests (profile2 + metric)', async () => {
        await client.getCompanyOverview('AAPL')

        expect(mockFetch).toHaveBeenCalledTimes(2)
        const urls = (mockFetch.mock.calls as string[][]).map((c) => c[0])
        const hasProfile = urls.some((u) => u.includes('/stock/profile2'))
        const hasMetric = urls.some((u) => u.includes('/stock/metric'))
        expect(hasProfile).toBe(true)
        expect(hasMetric).toBe(true)
    })

    test('falls back to symbol when profile fields are missing', async () => {
        const emptyFetch = mock(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({}),
            } as Response),
        )
        const emptyClient = new FinnhubClient('test-key', emptyFetch as any)

        const overview = await emptyClient.getCompanyOverview('TSLA')

        expect(overview.symbol).toBe('TSLA')
        expect(overview.name).toBe('TSLA')
        expect(overview.sector).toBeUndefined()
    })

    test('handles null metric values gracefully', async () => {
        const nullMetricFetch = mock(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                    Promise.resolve({
                        metric: {
                            peBasicExclExtraTTM: null,
                            marketCapitalization: null,
                            epsBasicExclExtraItemsTTM: null,
                            dividendYieldIndicatedAnnual: null,
                        },
                    }),
            } as Response),
        )
        const nullClient = new FinnhubClient('test-key', nullMetricFetch as any)

        const overview = await nullClient.getCompanyOverview('TEST')

        expect(overview.pe).toBeUndefined()
        expect(overview.marketCap).toBeUndefined()
        expect(overview.eps).toBeUndefined()
        expect(overview.dividendYield).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// getCompanyNews
// ---------------------------------------------------------------------------

describe('FinnhubClient.getCompanyNews', () => {
    const mockNews = [
        {
            category: 'company',
            datetime: 1700000000,
            headline: 'Apple releases new product',
            id: 12345,
            image: 'https://example.com/image.jpg',
            related: 'AAPL',
            source: 'Reuters',
            summary: 'Apple announced a new product today.',
            url: 'https://example.com/article',
        },
    ]

    test('returns array of FinnhubNewsItem', async () => {
        const mockFetch = createMockFetch(mockNews)
        const client = new FinnhubClient('test-key', mockFetch)

        const news = await client.getCompanyNews('AAPL', '2024-01-01', '2024-01-31')

        expect(news).toHaveLength(1)
        expect(news[0].headline).toBe('Apple releases new product')
        expect(news[0].source).toBe('Reuters')
        expect(news[0].related).toBe('AAPL')
    })

    test('passes symbol, from, to as query params', async () => {
        const mockFetch = createMockFetch([])
        const client = new FinnhubClient('test-key', mockFetch)

        await client.getCompanyNews('TSLA', '2024-03-01', '2024-03-31')

        const calledUrl = (mockFetch.mock.calls[0] as string[])[0]
        expect(calledUrl).toContain('/company-news')
        expect(calledUrl).toContain('symbol=TSLA')
        expect(calledUrl).toContain('from=2024-03-01')
        expect(calledUrl).toContain('to=2024-03-31')
    })

    test('throws on non-ok response', async () => {
        const mockFetch = createMockFetch({}, 500)
        const client = new FinnhubClient('test-key', mockFetch)

        await expect(
            client.getCompanyNews('AAPL', '2024-01-01', '2024-01-31'),
        ).rejects.toThrow('Finnhub /company-news failed: 500')
    })

    test('returns empty array when no news', async () => {
        const mockFetch = createMockFetch([])
        const client = new FinnhubClient('test-key', mockFetch)

        const news = await client.getCompanyNews('UNKNOWN', '2024-01-01', '2024-01-31')

        expect(news).toEqual([])
    })
})
