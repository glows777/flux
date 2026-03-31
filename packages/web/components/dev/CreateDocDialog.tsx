'use client'

import { useState, useCallback } from 'react'

interface CreateDocDialogProps {
    readonly open: boolean
    readonly onClose: () => void
    readonly onCreated: (path: string) => void
}

export function CreateDocDialog({ open, onClose, onCreated }: CreateDocDialogProps) {
    const [path, setPath] = useState('')
    const [content, setContent] = useState('')
    const [creating, setCreating] = useState(false)

    const handleClose = useCallback(() => {
        setPath('')
        setContent('')
        onClose()
    }, [onClose])

    const handleCreate = useCallback(async () => {
        if (!path.trim()) return
        setCreating(true)
        try {
            await fetch('/api/memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path.trim(), content }),
            })
            onCreated(path.trim())
            setPath('')
            setContent('')
            onClose()
        } finally {
            setCreating(false)
        }
    }, [path, content, onCreated, onClose])

    if (!open) return null

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center'>
            <div
                className='absolute inset-0 bg-black/60'
                onClick={handleClose}
                onKeyDown={() => {}}
                role='presentation'
            />
            <div className='relative bg-[#0a0a0a] border border-white/10 rounded-lg p-5 max-w-md w-full mx-4'>
                <h3 className='text-sm font-medium text-white mb-3'>
                    新建文档
                </h3>

                <input
                    type='text'
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder='文档路径 (e.g. opinions/MSFT.md)'
                    className='w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 mb-3'
                />

                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder='初始内容 (可选)'
                    rows={6}
                    className='w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 resize-none mb-4'
                />

                <div className='flex justify-end gap-2'>
                    <button
                        type='button'
                        onClick={handleClose}
                        className='px-3 py-1 text-xs rounded text-slate-400 hover:text-white transition-colors'
                    >
                        取消
                    </button>
                    <button
                        type='button'
                        disabled={!path.trim() || creating}
                        onClick={handleCreate}
                        className='px-3 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
                    >
                        {creating ? '创建中...' : '创建'}
                    </button>
                </div>
            </div>
        </div>
    )
}
