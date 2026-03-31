'use client'

import type { MacroTicker } from '@flux/shared'

interface MacroTickerItemProps extends MacroTicker {}

export function MacroTickerItem({
    sym,
    val,
    chg,
    trend,
}: MacroTickerItemProps) {
    return (
        <div className='flex items-center gap-2 text-xs font-medium whitespace-nowrap cursor-pointer group'>
            <span className='text-slate-500 group-hover:text-white transition-colors'>
                {sym}
            </span>
            <span className='text-white'>{val}</span>
            <span
                className={
                    trend === 'up' ? 'text-emerald-400' : 'text-rose-400'
                }
            >
                {chg}
            </span>
        </div>
    )
}
