'use client'

import useSWR from 'swr'
import { X } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { SearchQuery } from './SearchBar'
import { SearchResultCard } from './SearchResultCard'

interface SearchResult {
    readonly id: string
    readonly docPath: string
    readonly content: string
    readonly score: number
    readonly entities: readonly string[]
}

interface SearchResultsProps {
    readonly query: SearchQuery
    readonly onNavigate: (path: string) => void
    readonly onClose?: () => void
}

function buildSearchUrl(query: SearchQuery): string {
    const params = new URLSearchParams({ q: query.q })
    if (query.symbol) params.set('symbol', query.symbol)
    return `/api/memory/search?${params.toString()}`
}

export function SearchResults({ query, onNavigate, onClose }: SearchResultsProps) {
    const { data: results, isLoading } = useSWR<SearchResult[]>(
        buildSearchUrl(query),
        fetcher,
    )

    return (
        <div className='flex flex-col h-full'>
            <div className='flex items-center justify-between px-4 py-2 border-b border-white/10'>
                <span className='text-xs text-slate-400'>
                    {isLoading
                        ? '搜索中...'
                        : `${results?.length ?? 0} 条结果`}
                </span>
                {onClose && (
                    <button
                        type='button'
                        onClick={onClose}
                        className='flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors'
                    >
                        <X className='w-3 h-3' />
                        关闭搜索
                    </button>
                )}
            </div>

            <div className='flex-1 overflow-y-auto p-4 space-y-3'>
                {isLoading && (
                    <div className='text-xs text-slate-600 text-center py-8'>
                        Loading...
                    </div>
                )}

                {!isLoading && (!results || results.length === 0) && (
                    <div className='text-xs text-slate-600 text-center py-8'>
                        无搜索结果
                    </div>
                )}

                {results?.map((result) => (
                    <SearchResultCard
                        key={result.id}
                        docPath={result.docPath}
                        content={result.content}
                        score={result.score}
                        entities={result.entities}
                        onNavigate={() => onNavigate(result.docPath)}
                    />
                ))}
            </div>
        </div>
    )
}
