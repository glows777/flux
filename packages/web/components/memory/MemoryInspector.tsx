'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Brain } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { SlotTabs } from './SlotTabs'
import { SlotPanel } from './SlotPanel'
import type { SlotEntry } from './SlotTabs'

export function MemoryInspector() {
    const { data, isLoading } = useSWR<SlotEntry[]>(
        '/api/memory/slots/full',
        fetcher,
    )

    const slots = data ?? []
    const defaultSlot = slots.find((s) => s.content !== null)?.slot ?? slots[0]?.slot ?? 'user_profile'
    const [activeSlot, setActiveSlot] = useState<string>(defaultSlot)

    const activeEntry = slots.find((s) => s.slot === activeSlot)

    return (
        <div className='flex flex-col h-full'>
            {/* Header */}
            <div className='h-14 flex items-center px-4 border-b border-white/10 gap-3 shrink-0'>
                <Brain className='w-5 h-5 text-emerald-400' />
                <span className='text-sm font-medium text-white'>Memory</span>
            </div>

            {isLoading && (
                <div className='flex-1 flex items-center justify-center text-xs text-slate-600'>
                    Loading...
                </div>
            )}

            {!isLoading && (
                <div className='flex flex-1 overflow-hidden'>
                    {/* Left: slot tabs */}
                    <div className='w-52 border-r border-white/10 overflow-y-auto shrink-0'>
                        <SlotTabs
                            slots={slots}
                            activeSlot={activeSlot}
                            onSelect={setActiveSlot}
                        />
                    </div>

                    {/* Right: slot panel */}
                    <div className='flex-1 overflow-hidden'>
                        {activeEntry ? (
                            <SlotPanel slot={activeEntry} />
                        ) : (
                            <div className='flex items-center justify-center h-full text-xs text-slate-600'>
                                无数据
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
