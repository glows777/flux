/**
 * E2E Mock Data Factories
 *
 * Provides factory functions for mock responses so tests can
 * customize data without modifying the shared mock defaults.
 */

interface YahooQuoteOverrides {
    symbol?: string
    regularMarketPrice?: number
    regularMarketChangePercent?: number
    regularMarketVolume?: number
    shortName?: string
    longName?: string
    marketCap?: number
    sector?: string
}

export function createYahooQuoteResponse(overrides: YahooQuoteOverrides = {}) {
    return {
        symbol: overrides.symbol ?? 'AAPL',
        regularMarketPrice: overrides.regularMarketPrice ?? 150.0,
        regularMarketChangePercent: overrides.regularMarketChangePercent ?? 1.5,
        regularMarketVolume: overrides.regularMarketVolume ?? 80_000_000,
        shortName: overrides.shortName ?? 'Apple Inc.',
        longName: overrides.longName,
        marketCap: overrides.marketCap ?? 3_000_000_000_000,
        sector: overrides.sector ?? 'Technology',
    }
}

interface ChartDateRange {
    period1: Date
    period2: Date
}

export function createYahooChartResponse(
    _symbol: string,
    daysOrRange: number | ChartDateRange = 5,
) {
    const now = new Date()
    let dates: Date[]

    if (typeof daysOrRange === 'number') {
        // Fixed count: generate N weekday dates backwards from yesterday
        dates = []
        let offset = 1
        while (dates.length < daysOrRange) {
            const d = new Date(
                Date.UTC(
                    now.getUTCFullYear(),
                    now.getUTCMonth(),
                    now.getUTCDate() - offset,
                ),
            )
            const dow = d.getUTCDay()
            if (dow !== 0 && dow !== 6) {
                dates.push(d)
            }
            offset++
        }
        dates.reverse()
    } else {
        // Date range: generate all weekday dates within [period1, period2]
        const start = new Date(
            Date.UTC(
                daysOrRange.period1.getUTCFullYear(),
                daysOrRange.period1.getUTCMonth(),
                daysOrRange.period1.getUTCDate(),
            ),
        )
        const end = new Date(
            Date.UTC(
                daysOrRange.period2.getUTCFullYear(),
                daysOrRange.period2.getUTCMonth(),
                daysOrRange.period2.getUTCDate(),
            ),
        )
        dates = []
        const current = new Date(start)
        while (current <= end) {
            if (current.getUTCDay() !== 0 && current.getUTCDay() !== 6) {
                dates.push(new Date(current))
            }
            current.setUTCDate(current.getUTCDate() + 1)
        }
    }

    return {
        quotes: dates.map((d, i) => ({
            date: d.toISOString(),
            open: 145 + i * 0.1,
            high: 155 + i * 0.1,
            low: 140 + i * 0.1,
            close: 148 + i * 0.2,
            volume: 1_000_000 + i * 10_000,
        })),
    }
}

interface QuoteSummaryOverrides {
    trailingPE?: number
    dividendYield?: number | null
    trailingEps?: number
}

export function createYahooQuoteSummaryResponse(
    overrides: QuoteSummaryOverrides = {},
) {
    return {
        summaryDetail: {
            trailingPE: overrides.trailingPE ?? 28.5,
            dividendYield:
                overrides.dividendYield !== undefined
                    ? overrides.dividendYield
                    : 0.005,
        },
        defaultKeyStatistics: {
            trailingEps: overrides.trailingEps ?? 6.15,
        },
    }
}

export function createFinnhubNewsItems(symbol: string, count = 5) {
    return Array.from({ length: count }, (_, i) => ({
        category: 'company',
        datetime: Math.floor(Date.now() / 1000) - (i + 1) * 3600,
        headline: `${symbol} news headline ${i + 1}`,
        id: 2000 + i,
        image: `https://example.com/img${i}.jpg`,
        related: symbol,
        source: i % 2 === 0 ? 'Reuters' : 'Bloomberg',
        summary: `${symbol} summary ${i + 1}`,
        url: `https://example.com/news/${symbol.toLowerCase()}-${i + 1}`,
    }))
}

interface SymbolQuoteConfig {
    symbol: string
    price: number
    change: number
    volume?: number
    shortName?: string
    marketCap?: number
    sector?: string
}

export function createMultiSymbolQuoteMock(configs: SymbolQuoteConfig[]) {
    const symbolMap = new Map(
        configs.map((c) => [
            c.symbol,
            createYahooQuoteResponse({
                symbol: c.symbol,
                regularMarketPrice: c.price,
                regularMarketChangePercent: c.change,
                regularMarketVolume: c.volume ?? 50_000_000,
                shortName: c.shortName ?? c.symbol,
                marketCap: c.marketCap ?? 1_000_000_000_000,
                sector: c.sector ?? 'Technology',
            }),
        ]),
    )

    return async (symbol: string) => {
        const data = symbolMap.get(symbol)
        if (!data) {
            throw new Error(
                `Invalid or missing price data for symbol: ${symbol}`,
            )
        }
        return data
    }
}
