'use client'

import { useEffect, useState } from 'react'

interface DocEditorProps {
    readonly content: string
    readonly saving: boolean
    readonly onSave: (content: string) => void
    readonly onCancel: () => void
}

export function DocEditor({
    content,
    saving,
    onSave,
    onCancel,
}: DocEditorProps) {
    const [draft, setDraft] = useState(content)

    useEffect(() => {
        setDraft(content)
    }, [content])

    const isDirty = draft !== content

    return (
        <div className='flex flex-col h-full'>
            <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className='flex-1 w-full bg-transparent text-slate-300 text-sm font-mono px-4 py-3 resize-none focus:outline-none'
                spellCheck={false}
            />
            <div className='flex items-center gap-2 px-4 py-2 border-t border-white/10'>
                <button
                    type='button'
                    disabled={!isDirty || saving}
                    onClick={() => onSave(draft)}
                    className='px-3 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
                >
                    {saving ? '保存中...' : '保存'}
                </button>
                <button
                    type='button'
                    onClick={onCancel}
                    className='px-3 py-1 text-xs rounded text-slate-400 hover:text-white transition-colors'
                >
                    取消
                </button>
            </div>
        </div>
    )
}
