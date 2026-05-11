/**
 * Finnhub API client implementation
 *
 * Full market data client for Finnhub.io supporting:
 * - Real-time quotes
 * - Historical candle data
 * - Company profile + metrics
 * - Company news
 *
 * Constructor accepts an optional fetchFn for test injection.
 * Defaults to proxyFetch for proxy-aware HTTP requests.
 */

import { proxyFetch } from './proxy-fetch'
import type {
    CompanyOverview,
    FinnhubMarketDataClient,
    FinnhubNewsItem,
    HistoryPoint,
    Quote,
} from './types'

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1'

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export class FinnhubClient implements FinnhubMarketDataClient {
    constructor(
        private readonly apiKey: string,
        private readonly fetch: FetchFn = proxyFetch as unknown as FetchFn,
    ) {}

    private async request<T>(
        path: string,
        params: Record<string, string> = {},
    ): Promise<T> {
        const url = new URL(`${FINNHUB_BASE_URL}${path}`)
        url.searchParams.set('token', this.apiKey)
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v)
        }
        const response = await this.fetch(url.toString())
        if (!response.ok) {
            throw new Error(`Finnhub ${path} failed: ${response.status}`)
        }
        return response.json() as Promise<T>
    }

    async getQuote(symbol: string): Promise<Quote> {
        const data = await this.request<{
            c: number
            dp: number
            v: number
        }>('/quote', { symbol })
        return {
            symbol,
            price: data.c,
            change: data.dp,
            volume: data.v ?? undefined,
            timestamp: new Date(),
        }
    }

    async getDailyHistory(
        symbol: string,
        days: number,
    ): Promise<HistoryPoint[]> {
        const to = Math.floor(Date.now() / 1000)
        const from = to - days * 24 * 60 * 60
        const data = await this.request<{
            s: string
            t?: number[]
            o?: number[]
            h?: number[]
            l?: number[]
            c?: number[]
            v?: number[]
        }>('/stock/candle', {
            symbol,
            resolution: 'D',
            from: String(from),
            to: String(to),
        })
        if (data.s !== 'ok' || !data.t) return []

        const points: HistoryPoint[] = []
        for (const [i, ts] of data.t.entries()) {
            const open = data.o?.[i]
            const high = data.h?.[i]
            const low = data.l?.[i]
            const close = data.c?.[i]
            const volume = data.v?.[i]

            if (
                !Number.isFinite(ts) ||
                typeof open !== 'number' ||
                !Number.isFinite(open) ||
                typeof high !== 'number' ||
                !Number.isFinite(high) ||
                typeof low !== 'number' ||
                !Number.isFinite(low) ||
                typeof close !== 'number' ||
                !Number.isFinite(close)
            ) {
                continue
            }

            points.push({
                date: new Date(ts * 1000),
                open,
                high,
                low,
                close,
                volume:
                    typeof volume === 'number' && Number.isFinite(volume)
                        ? volume
                        : undefined,
            })
        }

        return points
    }

    async getCompanyOverview(symbol: string): Promise<CompanyOverview> {
        const [profile, metricData] = await Promise.all([
            this.request<{
                ticker?: string
                name?: string
                finnhubIndustry?: string
            }>('/stock/profile2', { symbol }),
            this.request<{ metric?: Record<string, number | null> }>(
                '/stock/metric',
                { symbol, metric: 'all' },
            ),
        ])
        const m = metricData.metric ?? {}
        return {
            symbol: profile.ticker ?? symbol,
            name: profile.name ?? symbol,
            sector: profile.finnhubIndustry ?? undefined,
            pe: m.peBasicExclExtraTTM ?? undefined,
            marketCap: m.marketCapitalization
                ? m.marketCapitalization * 1_000_000
                : undefined,
            eps: m.epsBasicExclExtraItemsTTM ?? undefined,
            dividendYield: m.dividendYieldIndicatedAnnual ?? undefined,
        }
    }

    async getCompanyNews(
        symbol: string,
        from: string,
        to: string,
    ): Promise<FinnhubNewsItem[]> {
        return this.request<FinnhubNewsItem[]>('/company-news', {
            symbol,
            from,
            to,
        })
    }
}
