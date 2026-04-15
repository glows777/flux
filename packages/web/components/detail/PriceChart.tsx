'use client'

import { formatCurrency, type HoldingItem } from '@flux/shared'
import { useState } from 'react'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    YAxis,
} from 'recharts'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { PeriodButton } from './PeriodButton'

interface PriceChartProps {
    symbol: string
    name: string
    position?: HoldingItem | null
}

type Period = '1日' | '1周' | '1月' | '3月' | '今年' | '1年'

const PERIODS: Period[] = ['1日', '1周', '1月', '3月', '今年', '1年']

const PERIOD_TO_API: Record<Period, string> = {
    '1日': '1D',
    '1周': '1W',
    '1月': '1M',
    '3月': '3M',
    今年: 'YTD',
    '1年': '1Y',
}

interface ChartDataPoint {
    date: string
    open: number
    high: number
    low: number
    close: number
    volume?: number
}

interface StockHistoryResult {
    symbol: string
    period: string
    points: ChartDataPoint[]
}

interface StockQuoteResult {
    symbol: string
    price: number
    change: number
    volume?: number
    timestamp: string
}

function formatDate(dateStr: string, period: Period): string {
    const date = new Date(dateStr)
    if (period === '1日') {
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
        })
    }
    if (period === '1周' || period === '1月') {
        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
        })
    }
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

interface ChartTooltipPayload {
    date: string
    price: number
}

function ChartTooltip({
    active,
    payload,
    period,
}: {
    active?: boolean
    payload?: Array<{ payload: ChartTooltipPayload }>
    period: Period
}) {
    if (!active || !payload?.[0]) return null

    const data = payload[0].payload
    return (
        <div className='rounded-lg border border-white/10 bg-black/90 px-3 py-2 backdrop-blur-sm'>
            <div className='text-xs text-slate-400'>
                {formatDate(data.date, period)}
            </div>
            <div className='text-sm font-medium text-emerald-400'>
                ${data.price.toFixed(2)}
            </div>
        </div>
    )
}

/**
 * 主价格图表组件
 * 从 API 获取历史数据，支持周期切换
 */
export function PriceChart({ symbol, name, position }: PriceChartProps) {
    const [activePeriod, setActivePeriod] = useState<Period>('1月')

    const apiPeriod = PERIOD_TO_API[activePeriod]
    const encodedSymbol = encodeURIComponent(symbol)

    const { data: history, isLoading } = useSWR<StockHistoryResult>(
        `/api/stocks/${encodedSymbol}/history?period=${apiPeriod}`,
        fetcher,
        { keepPreviousData: true },
    )
    const { data: quote } = useSWR<StockQuoteResult>(
        `/api/stocks/${encodedSymbol}/quote`,
        fetcher,
    )

    const chartData = (history?.points ?? []).map((p) => ({
        date: p.date,
        price: p.close,
    }))

    const lastClose =
        chartData.length > 0 ? chartData[chartData.length - 1].price : 0
    const headlinePrice = quote?.price ?? lastClose
    const firstOpen = history?.points?.[0]?.open ?? lastClose
    const historyChange =
        firstOpen !== 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : 0
    const change = quote?.change ?? historyChange

    const isPositive = change >= 0
    const changeColor = isPositive ? 'text-emerald-400' : 'text-rose-400'
    const changeSign = isPositive ? '+' : ''

    return (
        <div className='rounded-3xl p-8 border border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent'>
            {/* Header: Price Info + Period Selector */}
            <div className='flex items-start justify-between mb-8'>
                {/* Left: Price Info */}
                <div className='space-y-2'>
                    {isLoading && chartData.length === 0 ? (
                        <>
                            <div className='h-5 w-40 bg-white/5 rounded animate-pulse' />
                            <div className='h-12 w-48 bg-white/5 rounded animate-pulse' />
                            <div className='h-4 w-24 bg-white/5 rounded animate-pulse' />
                        </>
                    ) : (
                        <>
                            <div className='flex items-center gap-2'>
                                <span className='text-base font-semibold text-white'>
                                    {symbol.toUpperCase()}
                                </span>
                                <span className='text-sm text-slate-500'>
                                    &middot;
                                </span>
                                <span className='text-sm text-slate-500'>
                                    {name}
                                </span>
                            </div>
                            <div className='text-5xl font-light text-white tracking-tight'>
                                ${headlinePrice.toFixed(2)}
                            </div>
                            <span
                                className={`text-sm font-medium ${changeColor}`}
                            >
                                {changeSign}
                                {change.toFixed(2)}%
                            </span>
                        </>
                    )}
                </div>

                {/* Right: Period Selector */}
                <div className='flex items-center gap-2'>
                    {PERIODS.map((period) => (
                        <PeriodButton
                            key={period}
                            label={period}
                            active={activePeriod === period}
                            onClick={() => setActivePeriod(period)}
                        />
                    ))}
                </div>
            </div>

            {/* Chart Area */}
            <div className='h-[350px] w-full'>
                {isLoading && chartData.length === 0 ? (
                    <div className='h-full w-full bg-white/5 rounded animate-pulse' />
                ) : (
                    <ResponsiveContainer
                        width='100%'
                        height='100%'
                        initialDimension={{ width: 1, height: 1 }}
                    >
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient
                                    id='gradientFlux'
                                    x1='0'
                                    y1='0'
                                    x2='0'
                                    y2='1'
                                >
                                    <stop
                                        offset='5%'
                                        stopColor='#10b981'
                                        stopOpacity={0.2}
                                    />
                                    <stop
                                        offset='95%'
                                        stopColor='#10b981'
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                horizontal
                                vertical={false}
                                stroke='rgba(255,255,255,0.03)'
                            />
                            <YAxis
                                dataKey='price'
                                axisLine={false}
                                tickLine={false}
                                width={60}
                                tickCount={4}
                                tick={{ fill: '#475569', fontSize: 11 }}
                                tickFormatter={(v: number) => formatCurrency(v)}
                                domain={['auto', 'auto']}
                            />
                            <Tooltip
                                content={<ChartTooltip period={activePeriod} />}
                                cursor={{
                                    stroke: 'rgba(255,255,255,0.15)',
                                    strokeWidth: 1,
                                }}
                            />
                            <Area
                                type='monotone'
                                dataKey='price'
                                stroke='#10b981'
                                strokeWidth={2}
                                fill='url(#gradientFlux)'
                            />
                            {position && (
                                <ReferenceLine
                                    y={position.avgCost}
                                    stroke={
                                        position.currentPrice >=
                                        position.avgCost
                                            ? '#34d399'
                                            : '#fb7185'
                                    }
                                    strokeDasharray='6 4'
                                    strokeWidth={1.5}
                                    label={{
                                        value: `成本 $${position.avgCost.toFixed(2)}`,
                                        position: 'right',
                                        fill:
                                            position.currentPrice >=
                                            position.avgCost
                                                ? '#34d399'
                                                : '#fb7185',
                                        fontSize: 11,
                                    }}
                                />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    )
}
