'use client'

import useSWR from 'swr'
import { Plus } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { DocTreeGroup } from './DocTreeGroup'
import { DocTreeItem } from './DocTreeItem'

// ─── Types ───

interface DocInfo {
    readonly id: string
    readonly path: string
    readonly evergreen: boolean
    readonly updatedAt: string
}

interface DocGroup {
    readonly label: string
    readonly docs: readonly DocInfo[]
}

interface DocTreeProps {
    readonly selectedPath: string | null
    readonly onSelect: (path: string) => void
    readonly onCreateClick?: () => void
}

// ─── Pure functions (exported for testing) ───

export function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'just now'
    const hours = Math.floor(minutes / 60)
    if (hours < 1) return `${minutes}m ago`
    const days = Math.floor(hours / 24)
    if (days < 1) return `${hours}h ago`
    const weeks = Math.floor(days / 7)
    if (weeks < 1) return `${days}d ago`
    return `${weeks}w ago`
}

export function groupDocuments(docs: readonly DocInfo[]): DocGroup[] {
    if (docs.length === 0) return []

    const rootDocs: DocInfo[] = []
    const dirMap = new Map<string, DocInfo[]>()

    for (const doc of docs) {
        const slashIndex = doc.path.indexOf('/')
        if (slashIndex === -1) {
            rootDocs.push(doc)
        } else {
            const dir = doc.path.slice(0, slashIndex)
            const existing = dirMap.get(dir)
            if (existing) {
                existing.push(doc)
            } else {
                dirMap.set(dir, [doc])
            }
        }
    }

    const groups: DocGroup[] = []

    if (rootDocs.length > 0) {
        groups.push({ label: '常驻文档', docs: rootDocs })
    }

    for (const [dir, dirDocs] of dirMap) {
        groups.push({ label: `${dir}/`, docs: dirDocs })
    }

    return groups
}

// ─── Component ───

export function DocTree({ selectedPath, onSelect, onCreateClick }: DocTreeProps) {
    const { data: docs, isLoading } = useSWR<DocInfo[]>('/api/memory', fetcher)

    const groups = groupDocuments(docs ?? [])

    return (
        <div className='flex flex-col h-full'>
            {onCreateClick && (
                <div className='px-3 py-2 border-b border-white/10'>
                    <button
                        type='button'
                        onClick={onCreateClick}
                        className='flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors'
                    >
                        <Plus className='w-3.5 h-3.5' />
                        新建文档
                    </button>
                </div>
            )}

            <div className='flex-1 overflow-y-auto'>
                {isLoading && (
                    <div className='px-3 py-4 text-xs text-slate-600'>
                        Loading...
                    </div>
                )}

                {!isLoading && groups.length === 0 && (
                    <div className='px-3 py-4 text-xs text-slate-600'>
                        No documents
                    </div>
                )}

                {groups.map((group) => (
                    <DocTreeGroup
                        key={group.label}
                        label={group.label}
                        count={group.docs.length}
                        defaultOpen
                    >
                        {group.docs.map((doc) => {
                            const fileName = doc.path.includes('/')
                                ? doc.path.split('/').pop()!
                                : doc.path
                            return (
                                <DocTreeItem
                                    key={doc.id}
                                    path={doc.path}
                                    fileName={fileName}
                                    evergreen={doc.evergreen}
                                    updatedAt={doc.updatedAt}
                                    selected={selectedPath === doc.path}
                                    onSelect={() => onSelect(doc.path)}
                                />
                            )
                        })}
                    </DocTreeGroup>
                ))}
            </div>
        </div>
    )
}
