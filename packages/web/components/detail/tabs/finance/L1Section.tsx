'use client'

import { Check, X } from 'lucide-react'
import type { EarningsL1 } from '@/lib/finance/types'
import { formatLargeNumber, formatPercent } from '@flux/shared'

interface L1SectionProps {
    readonly data: EarningsL1
}

// ─── Skeleton ───

export function L1Skeleton() {
    return (
        <div className='animate-pulse space-y-6'>
            <div className='grid grid-cols-2 gap-3'>
                <div className='h-20 bg-slate-800/50 rounded-xl' />
                <div className='h-20 bg-slate-800/50 rounded-xl' />
            </div>
            <div className='h-32 bg-slate-800/50 rounded-xl' />
            <div className='grid grid-cols-3 gap-3'>
                <div className='h-16 bg-slate-800/50 rounded-xl' />
                <div className='h-16 bg-slate-800/50 rounded-xl' />
                <div className='h-16 bg-slate-800/50 rounded-xl' />
            </div>
        </div>
    )
}

// ─── Beat/Miss Scorecard ───

function BeatMissCard({
    label,
    data,
}: {
    readonly label: string
    readonly data: { readonly actual: number; readonly expected: number } | null
}) {
    if (!data) {
        return (
            <div className='rounded-xl border border-white/5 bg-white/[0.02] p-3'>
                <div className='text-xs text-slate-500 mb-1'>{label}</div>
                <div className='text-sm text-slate-400'>--</div>
            </div>
        )
    }

    const isBeat = data.actual >= data.expected
    const isEps = label === 'EPS'

    const formatValue = (v: number) =>
        isEps ? `$${v.toFixed(2)}` : formatLargeNumber(v)

    return (
        <div className='rounded-xl border border-white/5 bg-white/[0.02] p-3'>
            <div className='flex items-center justify-between mb-2'>
                <span className='text-xs text-slate-500'>{label}</span>
                {isBeat ? (
                    <span className='flex items-center gap-1 text-xs text-emerald-400'>
                        <Check className='w-3 h-3' /> Beat
                    </span>
                ) : (
                    <span className='flex items-center gap-1 text-xs text-rose-400'>
                        <X className='w-3 h-3' /> Miss
                    </span>
                )}
            </div>
            <div className='text-sm text-white font-medium'>
                {formatValue(data.actual)}
            </div>
            <div className='text-xs text-slate-500 mt-0.5'>
                预期 {formatValue(data.expected)}
            </div>
        </div>
    )
}

// ─── Margin Trends ───

function MarginTrends({
    margins,
}: {
    readonly margins: EarningsL1['margins']
}) {
    const isLast = (i: number) => i === margins.length - 1

    return (
        <div className='rounded-xl border border-white/5 bg-white/[0.02] p-3'>
            <h4 className='text-xs text-slate-400 font-medium mb-3'>
                利润率趋势
            </h4>
            <div className='overflow-x-auto'>
                <table className='w-full text-xs'>
                    <thead>
                        <tr className='text-slate-500 border-b border-white/5'>
                            <th className='text-left py-1.5 pr-2 font-normal'>
                                季度
                            </th>
                            <th className='text-right py-1.5 px-2 font-normal'>
                                毛利率
                            </th>
                            <th className='text-right py-1.5 px-2 font-normal'>
                                营业利润率
                            </th>
                            <th className='text-right py-1.5 pl-2 font-normal'>
                                净利率
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {margins.map((m, i) => (
                            <tr
                                key={m.quarter}
                                className={
                                    isLast(i)
                                        ? 'text-white font-medium'
                                        : 'text-slate-400'
                                }
                            >
                                <td className='py-1.5 pr-2'>{m.quarter}</td>
                                <td className='text-right py-1.5 px-2'>
                                    {m.gross !== null ? `${m.gross.toFixed(1)}%` : '--'}
                                </td>
                                <td className='text-right py-1.5 px-2'>
                                    {m.operating !== null
                                        ? `${m.operating.toFixed(1)}%`
                                        : '--'}
                                </td>
                                <td className='text-right py-1.5 pl-2'>
                                    {m.net !== null ? `${m.net.toFixed(1)}%` : '--'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ─── Key Financials ───

function KeyFinancials({
    data,
}: {
    readonly data: EarningsL1['keyFinancials']
}) {
    const items = [
        { label: 'Revenue', value: formatLargeNumber(data.revenue) },
        { label: 'YoY', value: data.revenueYoY !== null ? formatPercent(data.revenueYoY) : '--' },
        { label: 'Operating Income', value: formatLargeNumber(data.operatingIncome) },
        { label: 'FCF', value: formatLargeNumber(data.fcf) },
        {
            label: 'Debt/Assets',
            value:
                data.debtToAssets !== null
                    ? `${data.debtToAssets.toFixed(1)}%`
                    : '--',
        },
    ]

    return (
        <div className='rounded-xl border border-white/5 bg-white/[0.02] p-3'>
            <h4 className='text-xs text-slate-400 font-medium mb-3'>
                关键财务指标
            </h4>
            <div className='grid grid-cols-2 gap-x-4 gap-y-2'>
                {items.map((item) => (
                    <div key={item.label} className='flex justify-between'>
                        <span className='text-xs text-slate-500'>
                            {item.label}
                        </span>
                        <span className='text-xs text-white font-medium'>
                            {item.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── L1Section ───

export function L1Section({ data }: L1SectionProps) {
    return (
        <div className='space-y-4'>
            {/* Beat/Miss */}
            <div className='grid grid-cols-2 gap-3'>
                <BeatMissCard label='Revenue' data={data.beatMiss.revenue} />
                <BeatMissCard label='EPS' data={data.beatMiss.eps} />
            </div>

            {/* Margin Trends */}
            <MarginTrends margins={data.margins} />

            {/* Key Financials */}
            <KeyFinancials data={data.keyFinancials} />
        </div>
    )
}
