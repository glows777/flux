/**
 * Yahoo Finance API client implementation
 *
 * Uses the yahoo-finance2 library as a fallback data source
 * when Alpha Vantage is unavailable or rate-limited.
 *
 * Supports special symbols:
 * - Crypto: BTC-USD, ETH-USD
 * - Indices: ^VIX, ^TNX, ^GSPC
 * - Regular stocks: AAPL, TSLA, etc.
 */

import YahooFinance from 'yahoo-finance2'
import type { CompanyOverview, HistoryPoint, MarketDataClient, Quote } from './types'
import { proxyFetch } from './proxy-fetch'

/**
 * Yahoo Finance client implementing the MarketDataClient interface.
 * Provides real-time quotes, historical data, and company fundamentals.
 *
 * Uses undici proxyFetch to bypass Next.js fetch patch and respect
 * HTTPS_PROXY/HTTP_PROXY environment variables.
 */
export class YahooFinanceClient implements MarketDataClient {
    private readonly yf = new YahooFinance({ fetch: proxyFetch as typeof fetch })

    /**
     * Get real-time quote for a symbol.
     * Uses the ?? operator to handle nullish values from the API.
     */
    async getQuote(symbol: string): Promise<Quote> {
        const quote = await this.yf.quote(symbol)

        // Validate required fields - throw error if missing instead of defaulting to 0
        if (
            quote.regularMarketPrice === null ||
            quote.regularMarketPrice === undefined
        ) {
            throw new Error(
                `Invalid or missing price data for symbol: ${symbol}`,
            )
        }

        return {
            symbol: quote.symbol,
            price: quote.regularMarketPrice,
            change: quote.regularMarketChangePercent ?? 0,
            volume: quote.regularMarketVolume,
            timestamp: new Date(),
        }
    }

    /**
     * Get batch quotes for multiple symbols in one call.
     * Returns a Map keyed by symbol.
     */
    async getBatchQuotes(symbols: string[]): Promise<Map<string, Quote>> {
        const results = new Map<string, Quote>()
        const quotes = await this.yf.quote(symbols)
        const quotesArray = Array.isArray(quotes) ? quotes : [quotes]
        for (const q of quotesArray) {
            if (q.symbol && q.regularMarketPrice != null) {
                results.set(q.symbol, {
                    symbol: q.symbol,
                    price: q.regularMarketPrice,
                    change: q.regularMarketChangePercent ?? 0,
                    volume: q.regularMarketVolume ?? undefined,
                    timestamp: new Date(),
                })
            }
        }
        return results
    }

    /**
     * Search for symbols using Yahoo Finance search.
     * Wraps the underlying yf.search() for use by the search service.
     */
    async search(query: string): Promise<{ quotes: Array<{ symbol?: string; isYahooFinance?: boolean; quoteType?: string; longname?: string; shortname?: string }> }> {
        return this.yf.search(query, { quotesCount: 10, newsCount: 0 })
    }

    /**
     * Get daily OHLCV history for a symbol over the specified number of days.
     * Calculates the date range and fetches data using chart().
     */
    async getDailyHistory(
        symbol: string,
        days: number,
    ): Promise<HistoryPoint[]> {
        const endDate = new Date()
        const startDate = new Date()
        startDate.setDate(endDate.getDate() - days)

        const result = await this.yf.chart(symbol, {
            period1: startDate,
            period2: endDate,
            interval: '1d',
        })

        // Sort ascending, then limit to requested number of days
        return result.quotes
            .filter((q) => q.close != null)
            .map((q) => ({
                date: new Date(q.date),
                open: q.open ?? q.close!,
                high: q.high ?? q.close!,
                low: q.low ?? q.close!,
                close: q.close!,
                volume: q.volume ?? undefined,
            }))
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .slice(-days)
    }

    /**
     * Get company overview/fundamentals for a symbol.
     * Fetches quote and quoteSummary in parallel for efficiency.
     * Falls back gracefully when data is missing.
     */
    async getCompanyOverview(symbol: string): Promise<CompanyOverview> {
        const [quote, summary] = await Promise.all([
            this.yf.quote(symbol),
            this.yf.quoteSummary(symbol, {
                modules: ['summaryDetail', 'defaultKeyStatistics'],
            }),
        ])

        // Fallback chain for name, default to 'Unknown'
        const name = quote.shortName ?? quote.longName ?? 'Unknown'

        return {
            symbol: quote.symbol,
            name,
            sector: quote.sector,
            pe: summary.summaryDetail?.trailingPE,
            marketCap: quote.marketCap,
            eps: summary.defaultKeyStatistics?.trailingEps,
            dividendYield: summary.summaryDetail?.dividendYield,
        }
    }
}
