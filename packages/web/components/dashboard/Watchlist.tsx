'use client'

import { Plus, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { showToast } from '@/components/ui/Toast'
import { client } from '@/lib/api'
import type { WatchlistItem as WatchlistItemType } from '@flux/shared'
import { AddWatchlistInput } from './AddWatchlistInput'
import { WatchlistItem } from './WatchlistItem'

interface WatchlistProps {
    items: WatchlistItemType[]
    onMutate: () => void
    onDelete: (symbol: string) => void
    positionSymbols?: readonly string[]
}

const ERROR_MESSAGES: Record<number, string> = {
    400: '股票代码格式错误',
    404: '股票代码无效或未找到',
    409: '该股票已在自选列表中',
    500: '添加失败，请稍后重试',
}

export function Watchlist({ items, onMutate, onDelete, positionSymbols }: WatchlistProps) {
    const router = useRouter()
    const [isAdding, setIsAdding] = useState(false)
    const [inputValue, setInputValue] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deletingSymbol, setDeletingSymbol] = useState<string | null>(null)

    const handleItemClick = (item: WatchlistItemType) => {
        router.push(`/detail/${item.id}`)
    }

    const handleCancel = () => {
        setIsAdding(false)
        setInputValue('')
    }

    const handleSubmit = async () => {
        const symbol = inputValue.trim()
        if (!symbol) return

        setIsSubmitting(true)
        try {
            const res = await client.api.watchlist.$post({
                json: { symbol },
            })

            if (res.ok) {
                onMutate()
                showToast(`已添加 ${symbol}`)
                handleCancel()
            } else {
                const message =
                    ERROR_MESSAGES[res.status] ?? '添加失败，请稍后重试'
                showToast(message)
            }
        } catch {
            showToast('网络错误，请检查连接')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (symbol: string) => {
        try {
            const res = await client.api.watchlist[':symbol'].$delete({
                param: { symbol },
            })

            if (res.ok) {
                onDelete(symbol)
                showToast(`已移除 ${symbol}`)
            } else {
                showToast('删除失败，请稍后重试')
            }
        } catch {
            showToast('网络错误，请检查连接')
        } finally {
            setDeletingSymbol(null)
        }
    }

    return (
        <div className='space-y-4'>
            {/* Header */}
            <div className='flex items-center justify-between px-4 pb-2'>
                <h2 className='text-xs font-bold text-slate-500 uppercase tracking-widest'>
                    自选股监控
                </h2>
                <div className='flex items-center gap-2'>
                    <Plus
                        size={14}
                        className={`cursor-pointer transition-colors ${
                            isAdding
                                ? 'text-emerald-400'
                                : 'text-slate-600 hover:text-emerald-400'
                        }`}
                        onClick={() => setIsAdding((prev) => !prev)}
                    />
                    <Settings
                        size={14}
                        className='text-slate-600 cursor-pointer hover:text-white transition-colors'
                    />
                </div>
            </div>

            {/* List */}
            <div className='flex flex-col gap-3'>
                {isAdding && (
                    <AddWatchlistInput
                        value={inputValue}
                        onChange={setInputValue}
                        onSubmit={handleSubmit}
                        onCancel={handleCancel}
                        isSubmitting={isSubmitting}
                    />
                )}
                {items.length > 0
                    ? items.map((item) => (
                          <WatchlistItem
                              key={item.id}
                              id={item.id}
                              name={item.name}
                              price={item.price}
                              chg={item.chg}
                              data={item.data}
                              onClick={() => handleItemClick(item)}
                              onDelete={() => handleDelete(item.id)}
                              onDeleteRequest={() => setDeletingSymbol(item.id)}
                              onDeleteCancel={() => setDeletingSymbol(null)}
                              isDeleting={deletingSymbol === item.id}
                              isPosition={positionSymbols?.includes(item.id) ?? false}
                          />
                      ))
                    : !isAdding && (
                          <button
                              type='button'
                              onClick={() => setIsAdding(true)}
                              className='h-16 w-full rounded-xl border border-dashed border-white/10 hover:border-emerald-500/30 bg-white/2 hover:bg-emerald-500/3 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-emerald-400 transition-all cursor-pointer'
                          >
                              <Plus size={14} />
                              添加第一支股票
                          </button>
                      )}
            </div>
        </div>
    )
}
