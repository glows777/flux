'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { ArrowLeft, Brain } from 'lucide-react'
import { SearchBar, type SearchQuery } from './SearchBar'
import { SearchResults } from './SearchResults'
import { DocTree } from './DocTree'
import { DocViewer } from './DocViewer'
import { CreateDocDialog } from './CreateDocDialog'

export function MemoryInspector() {
    const router = useRouter()
    const { mutate } = useSWRConfig()
    const [selectedPath, setSelectedPath] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState<SearchQuery | null>(null)
    const [showCreateDialog, setShowCreateDialog] = useState(false)

    const handleDocSelect = useCallback((path: string) => {
        setSelectedPath(path)
        setSearchQuery(null)
    }, [])

    const handleSearch = useCallback((query: SearchQuery | null) => {
        setSearchQuery(query)
    }, [])

    const handleSearchNavigate = useCallback((path: string) => {
        setSelectedPath(path)
        setSearchQuery(null)
    }, [])

    const handleCloseSearch = useCallback(() => {
        setSearchQuery(null)
    }, [])

    const handleDocCreated = useCallback(
        (path: string) => {
            setSelectedPath(path)
            mutate('/api/memory')
        },
        [mutate],
    )

    const handlePathCleared = useCallback(() => {
        setSelectedPath(null)
        mutate('/api/memory')
    }, [mutate])

    return (
        <div className='flex flex-col h-full'>
            {/* 顶栏 */}
            <div className='h-14 flex items-center px-4 border-b border-white/10 gap-3 shrink-0'>
                <Brain className='w-5 h-5 text-emerald-400' />
                <span className='text-sm font-medium text-white'>
                    Memory Inspector
                </span>

                <div className='flex-1' />

                <SearchBar onSearch={handleSearch} />

                <button
                    type='button'
                    onClick={() => router.push('/')}
                    className='flex items-center gap-1 text-xs text-white/50 hover:text-white/80 transition-colors ml-3'
                >
                    <ArrowLeft className='w-3.5 h-3.5' />
                    返回
                </button>
            </div>

            {/* 左右分栏 */}
            <div className='flex flex-1 overflow-hidden'>
                {/* 左栏 */}
                <div className='w-80 border-r border-white/10 overflow-y-auto'>
                    <DocTree
                        selectedPath={selectedPath}
                        onSelect={handleDocSelect}
                        onCreateClick={() => setShowCreateDialog(true)}
                    />
                </div>

                {/* 右栏 */}
                <div className='flex-1 overflow-hidden'>
                    {searchQuery ? (
                        <SearchResults
                            query={searchQuery}
                            onNavigate={handleSearchNavigate}
                            onClose={handleCloseSearch}
                        />
                    ) : (
                        <DocViewer
                            selectedPath={selectedPath}
                            onPathCleared={handlePathCleared}
                        />
                    )}
                </div>
            </div>

            <CreateDocDialog
                open={showCreateDialog}
                onClose={() => setShowCreateDialog(false)}
                onCreated={handleDocCreated}
            />
        </div>
    )
}
