'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronRight, Ellipsis, Trash2 } from 'lucide-react'
import { formatPercent } from '@flux/shared'
import { MiniChart } from '../charts/MiniChart'
import { DeleteConfirmPopover } from './DeleteConfirmPopover'

interface WatchlistItemProps {
    id: string
    name: string
    price: number
    chg: number
    signal?: string
    score?: number
    data: number[]
    onClick: () => void
    onDelete?: () => void
    onDeleteRequest?: () => void
    onDeleteCancel?: () => void
    isDeleting?: boolean
    isPosition?: boolean
}

/**
 * 自选股列表项
 * 可点击进入详情页，三点菜单提供移除自选操作
 */
export function WatchlistItem({
    id,
    name,
    price,
    chg,
    data,
    onClick,
    onDelete,
    onDeleteRequest,
    onDeleteCancel,
    isDeleting,
    isPosition,
}: WatchlistItemProps) {
    const isPositive = chg > 0
    const chartColor = isPositive ? '#34d399' : '#f43f5e'
    const showName = name !== id

    if (isDeleting) {
        return (
            <div className='h-[72px] w-full rounded-xl bg-white/[0.02] border border-rose-500/20 flex items-center px-6'>
                <DeleteConfirmPopover
                    symbol={id}
                    label='自选'
                    onConfirm={() => onDelete?.()}
                    onCancel={() => onDeleteCancel?.()}
                />
            </div>
        )
    }

    return (
        <div
            onClick={onClick}
            className='group relative h-[72px] w-full rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all cursor-pointer flex items-center px-6 overflow-hidden'
        >
            {/* 左侧光条 - hover 时显示 */}
            <div className='absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity' />

            {/* 股票代码和名称 (22%) */}
            <div className='w-[22%] min-w-0'>
                <div className='flex items-center gap-1.5'>
                    <span className='font-medium text-white'>{id}</span>
                    {isPosition && (
                        <span className='text-[10px] text-emerald-400/70 bg-emerald-400/10 px-1.5 py-0.5 rounded'>
                            持仓
                        </span>
                    )}
                </div>
                {showName && (
                    <div className='text-[10px] text-slate-500 truncate'>
                        {name}
                    </div>
                )}
            </div>

            {/* 迷你图表 (30%) */}
            <div className='w-[30%]'>
                <MiniChart
                    data={data}
                    color={chartColor}
                    className='h-12 w-full'
                />
            </div>

            {/* 价格 + 涨跌幅 (flex-1) */}
            <div className='flex-1 flex items-center justify-end gap-3 min-w-0'>
                <div className='text-right'>
                    <div className='text-sm font-medium text-white'>
                        ${price.toFixed(2)}
                    </div>
                    <div
                        className={`text-xs font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}
                    >
                        {formatPercent(chg)}
                    </div>
                </div>

                {/* 三点菜单 - Radix DropdownMenu (Portal 渲染，无溢出遮挡) */}
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            type='button'
                            onClick={(e) => e.stopPropagation()}
                            className='p-1.5 rounded-lg transition-all text-slate-600 hover:text-white hover:bg-white/10 data-[state=open]:text-white data-[state=open]:bg-white/10'
                        >
                            <Ellipsis size={16} />
                        </button>
                    </DropdownMenu.Trigger>

                    <DropdownMenu.Portal>
                        <DropdownMenu.Content
                            align='end'
                            sideOffset={4}
                            className='z-50 min-w-[140px] rounded-xl bg-[#0a0a0a] border border-white/10 shadow-xl shadow-black/40 py-1 animate-fade-in'
                            onClick={(e) => e.stopPropagation()}
                        >
                            {onDeleteRequest && (
                                <DropdownMenu.Item
                                    onSelect={() => onDeleteRequest()}
                                    className='flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer outline-none data-[highlighted]:text-rose-400 data-[highlighted]:bg-rose-500/10'
                                >
                                    <Trash2 size={13} />
                                    移除自选
                                </DropdownMenu.Item>
                            )}
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
            </div>

            {/* Chevron */}
            <div className='w-6 flex justify-end ml-2'>
                <ChevronRight
                    size={14}
                    className='text-slate-700 group-hover:text-white transition-colors'
                />
            </div>
        </div>
    )
}
