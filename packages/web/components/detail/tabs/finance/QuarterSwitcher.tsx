'use client'

import * as Select from '@radix-ui/react-select'
import { RefreshCw, ChevronDown, Check } from 'lucide-react'

interface QuarterOption {
    readonly year: number
    readonly quarter: number
    readonly key: string
    readonly label?: string
}

interface QuarterSwitcherProps {
    readonly quarters: ReadonlyArray<QuarterOption>
    readonly selectedKey: string
    readonly onQuarterChange: (key: string) => void
    readonly onRefresh: () => void
    readonly isRefreshing: boolean
    readonly isLoading?: boolean
    readonly cachedAt: string | null
}

export function QuarterSwitcher({
    quarters,
    selectedKey,
    onQuarterChange,
    onRefresh,
    isRefreshing,
    isLoading = false,
    cachedAt,
}: QuarterSwitcherProps) {
    const disabled = isLoading || isRefreshing

    return (
        <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
                {isLoading ? (
                    <div className='bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 h-8 w-40 animate-pulse' />
                ) : (
                    <Select.Root
                        value={selectedKey}
                        onValueChange={onQuarterChange}
                        disabled={disabled}
                    >
                        <Select.Trigger className='inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:border-white/20 data-[state=open]:border-emerald-500/50'>
                            <Select.Value />
                            <Select.Icon>
                                <ChevronDown size={14} className='text-slate-400' />
                            </Select.Icon>
                        </Select.Trigger>

                        <Select.Portal>
                            <Select.Content
                                position='popper'
                                sideOffset={4}
                                className='z-50 min-w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)] rounded-xl bg-[#0a0a0a] border border-white/10 shadow-xl shadow-black/40 py-1 overflow-hidden animate-fade-in'
                            >
                                <Select.Viewport>
                                    {quarters.map((q) => (
                                        <Select.Item
                                            key={q.key}
                                            value={q.key}
                                            className='flex items-center gap-2 px-3 py-2 text-sm text-slate-300 cursor-pointer outline-none data-[highlighted]:text-white data-[highlighted]:bg-white/10 transition-colors'
                                        >
                                            <Select.ItemText>
                                                {q.label ?? q.key}
                                            </Select.ItemText>
                                            <Select.ItemIndicator className='ml-auto'>
                                                <Check size={14} className='text-emerald-400' />
                                            </Select.ItemIndicator>
                                        </Select.Item>
                                    ))}
                                </Select.Viewport>
                            </Select.Content>
                        </Select.Portal>
                    </Select.Root>
                )}

                <button
                    onClick={onRefresh}
                    disabled={disabled}
                    className='flex items-center gap-1 text-sm text-slate-400 hover:text-white transition disabled:opacity-50'
                >
                    <RefreshCw
                        className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                </button>
            </div>

            {cachedAt && (
                <span className='text-xs text-slate-500'>
                    来自缓存 · {new Date(cachedAt).toLocaleString()}
                </span>
            )}
        </div>
    )
}
