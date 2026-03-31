'use client'

import useSWR from 'swr'
import { MetricCard } from './MetricCard'
import { fetcher } from '@/lib/fetcher'
import {
    formatPE,
    formatMarketCap,
    formatEPS,
    formatDividendYield,
} from '@flux/shared'
import type { StockMetrics } from '@flux/shared'

interface MetricsGridProps {
    symbol: string
}

function MetricsGridSkeleton() {
    return (
        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            {Array.from({ length: 4 }, (_, i) => (
                <div
                    key={i}
                    className='animate-pulse rounded-2xl border border-white/5 bg-white/[0.02] p-4'
                >
                    <div className='h-3 w-16 bg-white/5 rounded mb-3' />
                    <div className='h-5 w-20 bg-white/5 rounded' />
                </div>
            ))}
        </div>
    )
}

/**
 * 财务指标网格
 * 从 API 获取股票信息并格式化展示
 */
export function MetricsGrid({ symbol }: MetricsGridProps) {
    const encodedSymbol = encodeURIComponent(symbol)
    const { data: info, isLoading, error } = useSWR<StockMetrics>(
        `/api/stocks/${encodedSymbol}/info`,
        fetcher,
    )

    if (isLoading) {
        return <MetricsGridSkeleton />
    }

    if (error) {
        return (
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                {Array.from({ length: 4 }, (_, i) => (
                    <MetricCard key={i} label='--' value='--' />
                ))}
            </div>
        )
    }

    const metrics = [
        { label: '市盈率 (PE)', value: formatPE(info?.pe) },
        { label: '总市值', value: formatMarketCap(info?.marketCap) },
        { label: '每股收益 (EPS)', value: formatEPS(info?.eps) },
        { label: '股息率', value: formatDividendYield(info?.dividendYield) },
    ]

    return (
        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            {metrics.map((metric) => (
                <MetricCard
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                />
            ))}
        </div>
    )
}
