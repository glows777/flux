'use client'

import type { MacroTicker } from '@flux/shared'
import useSWR from 'swr'
import { MacroTickerItem } from '@/components/market/MacroTickerItem'
import { SearchBox } from '@/components/ui/SearchBox'
import { fetcher } from '@/lib/fetcher'
import { MACRO_TICKERS } from '@/lib/mock/data'

const MACRO_SKELETON_KEYS = [
    'macro-skeleton-1',
    'macro-skeleton-2',
    'macro-skeleton-3',
    'macro-skeleton-4',
] as const

export function Header() {
    const { data, isLoading, error } = useSWR<MacroTicker[]>(
        '/api/macro',
        fetcher,
        { refreshInterval: 60_000 },
    )

    const tickers = data ?? (error ? MACRO_TICKERS : [])

    return (
        <header className='h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/20 backdrop-blur-md'>
            {/* 宏观指标区域 - 可横向滚动 */}
            <div className='flex items-center gap-6 overflow-x-auto no-scrollbar'>
                {isLoading
                    ? MACRO_SKELETON_KEYS.map((key) => (
                          <div
                              key={key}
                              className='animate-pulse flex items-center gap-2 shrink-0'
                          >
                              <div className='h-4 w-12 bg-white/5 rounded' />
                              <div className='h-3 w-16 bg-white/5 rounded' />
                              <div className='h-3 w-10 bg-white/5 rounded' />
                          </div>
                      ))
                    : tickers.map((ticker) => (
                          <MacroTickerItem
                              key={ticker.sym}
                              sym={ticker.sym}
                              val={ticker.val}
                              chg={ticker.chg}
                              trend={ticker.trend}
                          />
                      ))}
            </div>

            {/* 搜索框 */}
            <div className='flex items-center gap-4'>
                <SearchBox />
            </div>
        </header>
    )
}
