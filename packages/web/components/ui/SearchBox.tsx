'use client'

import { Search } from 'lucide-react'

export function SearchBox() {
    return (
        <div className='hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-xs text-slate-400 hover:bg-white/10 hover:border-white/20 transition-all cursor-text min-w-[200px]'>
            <Search size={14} />
            <span>Command + K 搜索...</span>
        </div>
    )
}
