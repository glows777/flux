'use client'

import { formatRelativeTime } from './DocTree'

interface DocTreeItemProps {
    readonly path: string
    readonly fileName: string
    readonly evergreen: boolean
    readonly updatedAt: string
    readonly selected: boolean
    readonly onSelect: () => void
}

export function DocTreeItem({
    fileName,
    evergreen,
    updatedAt,
    selected,
    onSelect,
}: DocTreeItemProps) {
    return (
        <button
            type='button'
            onClick={onSelect}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors border-l-2 ${
                selected
                    ? 'bg-white/5 border-emerald-500 text-white'
                    : 'text-slate-400 hover:bg-white/[0.03] border-transparent'
            }`}
        >
            <span
                className={`text-[10px] ${
                    evergreen ? 'text-emerald-400' : 'text-slate-600'
                }`}
            >
                {evergreen ? '●' : '○'}
            </span>
            <span className='flex-1 truncate'>{fileName}</span>
            <span className='text-[10px] text-slate-600 shrink-0'>
                {formatRelativeTime(updatedAt)}
            </span>
        </button>
    )
}
