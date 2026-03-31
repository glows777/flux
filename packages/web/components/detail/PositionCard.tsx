'use client'

import { formatCurrency, formatSignedCurrency, type HoldingItem } from '@flux/shared'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'

interface PositionCardProps {
    readonly symbol: string
}

export function PositionCard({ symbol }: PositionCardProps) {
    const { data: position } = useSWR<HoldingItem | null>(
        `/api/stocks/${encodeURIComponent(symbol)}/position`,
        fetcher,
    )

    if (!position) return null

    const isProfitable = position.totalPnL >= 0
    const pnlColor = isProfitable ? 'text-emerald-400' : 'text-rose-400'

    return (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-3 text-xs font-medium tracking-wider text-white/40 uppercase">
                我的持仓
            </div>
            <div className="grid grid-cols-4 gap-4">
                <div>
                    <div className="text-[11px] text-white/40">数量</div>
                    <div className="text-sm font-medium text-white/90">
                        {position.shares}
                    </div>
                </div>
                <div>
                    <div className="text-[11px] text-white/40">平均成本</div>
                    <div className="text-sm font-medium text-white/90">
                        {formatCurrency(position.avgCost)}
                    </div>
                </div>
                <div>
                    <div className="text-[11px] text-white/40">现价</div>
                    <div className="text-sm font-medium text-white/90">
                        {formatCurrency(position.currentPrice)}
                    </div>
                </div>
                <div>
                    <div className="text-[11px] text-white/40">浮动盈亏</div>
                    <div className={`text-sm font-medium ${pnlColor}`}>
                        {formatSignedCurrency(position.totalPnL)}
                        <span className="ml-1 text-[11px] opacity-70">
                            ({position.totalPnL !== 0 && position.shares * position.avgCost > 0
                                ? `${((position.totalPnL / (position.shares * position.avgCost)) * 100).toFixed(2)}%`
                                : '0%'})
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Export hook for PriceChart to consume (SWR deduplicates same key)
export function usePosition(symbol: string) {
    return useSWR<HoldingItem | null>(
        `/api/stocks/${encodeURIComponent(symbol)}/position`,
        fetcher,
    )
}
