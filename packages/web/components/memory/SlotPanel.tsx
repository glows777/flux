'use client'

import { DocPreview } from './DocPreview'
import type { SlotEntry } from './SlotTabs'
import { formatSlotName } from './SlotTabs'
import { VersionTimeline } from './VersionTimeline'

interface SlotPanelProps {
    readonly slot: SlotEntry
}

export function SlotPanel({ slot }: SlotPanelProps) {
    const charCount = slot.content?.length ?? 0

    return (
        <div className='flex flex-col h-full overflow-hidden'>
            {/* Header */}
            <div className='flex items-center gap-3 px-4 py-2 border-b border-white/10 shrink-0'>
                <span className='text-sm font-medium text-white'>
                    {formatSlotName(slot.slot)}
                </span>
                <span className='text-[10px] text-slate-600 ml-auto'>
                    {charCount} / {slot.limit}
                </span>
            </div>

            {/* Scrollable body */}
            <div className='flex-1 overflow-y-auto'>
                {/* Current content */}
                <div className='border-b border-white/10'>
                    {slot.content ? (
                        <DocPreview content={slot.content} />
                    ) : (
                        <div className='px-4 py-6 text-xs text-slate-600 text-center'>
                            暂无记录
                        </div>
                    )}
                </div>

                {/* Version history */}
                <div>
                    <div className='px-4 pt-3 pb-1 text-[10px] text-slate-500 font-medium uppercase tracking-wider'>
                        版本历史
                    </div>
                    <VersionTimeline history={slot.history} />
                </div>
            </div>
        </div>
    )
}
