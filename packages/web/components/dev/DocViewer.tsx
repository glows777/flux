'use client'

import { useState, useEffect, useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Edit3, Trash2 } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { DocMeta } from './DocMeta'
import { DocPreview } from './DocPreview'
import { DocEditor } from './DocEditor'
import { ConfirmDialog } from './ConfirmDialog'

type Mode = 'empty' | 'preview' | 'edit'

interface DocData {
    readonly id: string
    readonly path: string
    readonly content: string
    readonly evergreen: boolean
    readonly updatedAt: string
    readonly entities: readonly string[]
}

interface DocViewerProps {
    readonly selectedPath: string | null
    readonly onPathCleared: () => void
}

export function DocViewer({ selectedPath, onPathCleared }: DocViewerProps) {
    const { mutate: globalMutate } = useSWRConfig()
    const [mode, setMode] = useState<Mode>('empty')
    const [saving, setSaving] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    const { data: doc, isLoading } = useSWR<DocData>(
        selectedPath ? `/api/memory/${selectedPath}` : null,
        fetcher,
    )

    useEffect(() => {
        setMode(selectedPath ? 'preview' : 'empty')
    }, [selectedPath])

    const handleSave = useCallback(
        async (content: string) => {
            if (!selectedPath) return
            setSaving(true)
            try {
                await fetch(`/api/memory/${selectedPath}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content }),
                })
                await globalMutate(`/api/memory/${selectedPath}`)
                await globalMutate('/api/memory')
                setMode('preview')
            } finally {
                setSaving(false)
            }
        },
        [selectedPath, globalMutate],
    )

    const handleDelete = useCallback(async () => {
        if (!selectedPath) return
        setShowDeleteConfirm(false)
        await fetch(`/api/memory/${selectedPath}`, { method: 'DELETE' })
        await globalMutate('/api/memory')
        onPathCleared()
    }, [selectedPath, globalMutate, onPathCleared])

    if (mode === 'empty' || !selectedPath) {
        return (
            <div className='flex items-center justify-center h-full text-xs text-slate-600'>
                选择左侧文档以查看内容
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className='flex items-center justify-center h-full text-xs text-slate-600'>
                Loading...
            </div>
        )
    }

    if (!doc) {
        return (
            <div className='flex items-center justify-center h-full text-xs text-slate-600'>
                Document not found
            </div>
        )
    }

    return (
        <div className='flex flex-col h-full'>
            <DocMeta
                path={doc.path}
                updatedAt={doc.updatedAt}
                evergreen={doc.evergreen}
                entities={doc.entities}
            />

            {/* Action bar */}
            <div className='flex items-center gap-2 px-4 py-1.5 border-b border-white/10'>
                {mode === 'preview' && (
                    <>
                        <button
                            type='button'
                            onClick={() => setMode('edit')}
                            className='flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors'
                        >
                            <Edit3 className='w-3 h-3' />
                            编辑
                        </button>
                        <button
                            type='button'
                            onClick={() => setShowDeleteConfirm(true)}
                            className='flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-400 transition-colors'
                        >
                            <Trash2 className='w-3 h-3' />
                            删除
                        </button>
                    </>
                )}
            </div>

            {/* Content area */}
            <div className='flex-1 overflow-y-auto'>
                {mode === 'preview' && <DocPreview content={doc.content} />}
                {mode === 'edit' && (
                    <DocEditor
                        content={doc.content}
                        saving={saving}
                        onSave={handleSave}
                        onCancel={() => setMode('preview')}
                    />
                )}
            </div>

            <ConfirmDialog
                open={showDeleteConfirm}
                title='删除文档'
                message={`确定要删除 ${doc.path} 吗？此操作不可恢复。`}
                confirmLabel='删除'
                destructive
                onConfirm={handleDelete}
                onCancel={() => setShowDeleteConfirm(false)}
            />
        </div>
    )
}
