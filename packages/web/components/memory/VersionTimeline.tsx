'use client'

import { useState } from 'react'
import { DocPreview } from './DocPreview'
import { formatRelativeTime } from './SlotTabs'

interface VersionEntry {
    readonly id: string
    readonly author: string
    readonly reason: string | null
    readonly createdAt: string
    readonly content: string
}

interface VersionTimelineProps {
    readonly history: readonly VersionEntry[]
}

export function VersionTimeline({ history }: VersionTimelineProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null)

    if (history.length === 0) {
        return (
            <div className='px-4 py-6 text-xs text-slate-600 text-center'>
                暂无版本记录
            </div>
        )
    }

    return (
        <div className='relative px-4 py-3'>
            {/* Vertical line */}
            <div className='absolute left-[27px] top-0 bottom-0 w-px bg-white/10' />

            <div className='space-y-4'>
                {history.map((v) => {
                    const isExpanded = expandedId === v.id
                    return (
                        <div key={v.id} className='relative flex gap-3'>
                            {/* Node dot */}
                            <div
                                className={`relative z-10 w-3 h-3 mt-0.5 shrink-0 rounded-full border-2 ${
                                    v.author === 'agent'
                                        ? 'border-emerald-400 bg-emerald-400/20'
                                        : 'border-slate-500 bg-slate-500/20'
                                }`}
                            />

                            {/* Content */}
                            <div className='flex-1 min-w-0'>
                                <div className='flex items-center gap-2'>
                                    <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                            v.author === 'agent'
                                                ? 'bg-emerald-500/10 text-emerald-400'
                                                : 'bg-slate-700 text-slate-400'
                                        }`}
                                    >
                                        {v.author}
                                    </span>
                                    <span className='text-[10px] text-slate-600'>
                                        {formatRelativeTime(v.createdAt)}
                                    </span>
                                </div>

                                {v.reason && (
                                    <div className='text-[10px] text-slate-500 mt-0.5 truncate'>
                                        {v.reason}
                                    </div>
                                )}

                                <button
                                    type='button'
                                    onClick={() =>
                                        setExpandedId(isExpanded ? null : v.id)
                                    }
                                    className='text-[10px] text-emerald-400/60 hover:text-emerald-400 transition-colors mt-1'
                                >
                                    {isExpanded ? '收起' : '查看内容'}
                                </button>

                                {isExpanded && (
                                    <div className='mt-2 rounded border border-white/10 bg-white/5 overflow-hidden'>
                                        <DocPreview content={v.content} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
