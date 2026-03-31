'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import type { SpotlightItem } from '@flux/shared'
import { formatCurrency, formatPercent } from '@flux/shared'

interface SpotlightCardProps {
    item: SpotlightItem
}

export function SpotlightCard({ item }: SpotlightCardProps) {
    const router = useRouter()
    const handleClick = () => router.push(`/detail/${item.symbol}?tab=chat`)

    const changeColor =
        item.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
    const gainColor =
        item.holding.gainPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
    const actionColor =
        item.signal === 'bearish' ? 'text-rose-400' : 'text-emerald-400'

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
            className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 cursor-pointer group hover:bg-white/[0.04] hover:border-white/10 transition-all"
        >
            {/* Header: symbol + change */}
            <div className="flex items-center justify-between">
                <span className="text-white font-medium">{item.symbol}</span>
                <span className={changeColor}>
                    {formatPercent(item.change)}
                </span>
            </div>

            {/* Sub-header: price + gain */}
            <div className="flex items-center justify-between mt-1">
                <span className="text-slate-400">
                    {formatCurrency(item.price)}
                </span>
                <span className={gainColor}>
                    {formatPercent(item.holding.gainPct)}
                </span>
            </div>

            {/* Divider */}
            <div className="border-t border-white/5 my-3" />

            {/* Reason */}
            <p className="text-sm text-slate-400 leading-relaxed">
                {item.reason}
            </p>

            {/* Action + arrow */}
            <div className="flex items-end justify-between mt-2">
                <span className={`${actionColor} font-medium text-sm`}>
                    → {item.action}
                </span>
                <ArrowRight
                    size={16}
                    className="text-slate-600 group-hover:text-emerald-400 transition-colors shrink-0 ml-2"
                />
            </div>
        </div>
    )
}
