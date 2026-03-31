'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface DocTreeGroupProps {
    readonly label: string
    readonly count: number
    readonly defaultOpen?: boolean
    readonly children: ReactNode
}

export function DocTreeGroup({
    label,
    count,
    defaultOpen = true,
    children,
}: DocTreeGroupProps) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <div>
            <button
                type='button'
                onClick={() => setOpen((prev) => !prev)}
                className='w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors'
            >
                {open ? (
                    <ChevronDown className='w-3 h-3' />
                ) : (
                    <ChevronRight className='w-3 h-3' />
                )}
                <span>{label}</span>
                <span className='text-slate-600'>({count})</span>
            </button>
            {open && <div>{children}</div>}
        </div>
    )
}
