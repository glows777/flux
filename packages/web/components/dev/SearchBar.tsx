'use client'

import { useState, useCallback } from 'react'
import { Search } from 'lucide-react'

export interface SearchQuery {
    readonly q: string
    readonly symbol?: string
}

interface SearchBarProps {
    readonly onSearch: (query: SearchQuery | null) => void
}

export function SearchBar({ onSearch }: SearchBarProps) {
    const [q, setQ] = useState('')
    const [symbol, setSymbol] = useState('')

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault()
            const trimmed = q.trim()
            if (!trimmed) return
            const query: SearchQuery = { q: trimmed }
            const sym = symbol.trim()
            if (sym) {
                onSearch({ ...query, symbol: sym })
            } else {
                onSearch(query)
            }
        },
        [q, symbol, onSearch],
    )

    return (
        <form onSubmit={handleSubmit} className='flex items-center gap-2'>
            <Search className='w-3.5 h-3.5 text-slate-500' />
            <input
                type='text'
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='搜索记忆...'
                className='w-48 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50'
            />
            <input
                type='text'
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder='Symbol'
                className='w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50'
            />
            <button
                type='submit'
                className='px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors'
            >
                搜索
            </button>
        </form>
    )
}
