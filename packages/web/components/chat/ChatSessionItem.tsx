'use client'

import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export interface ChatSession {
    readonly id: string
    readonly symbol: string | null
    readonly title: string
    readonly createdAt: string
    readonly updatedAt: string
}

interface ChatSessionItemProps {
    readonly session: ChatSession
    readonly isActive: boolean
    readonly onSwitch: (id: string) => void
    readonly onDelete: (id: string) => void
    readonly onRename: (id: string, title: string) => void
}

function formatRelativeTime(dateStr: string): string {
    const now = Date.now()
    const date = new Date(dateStr).getTime()
    const diffMs = now - date

    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}小时前`

    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}天前`

    return new Date(dateStr).toLocaleDateString('zh-CN')
}

export function ChatSessionItem({
    session,
    isActive,
    onSwitch,
    onDelete,
    onRename,
}: ChatSessionItemProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState('')
    const [isDeleting, setIsDeleting] = useState(false)
    const [shakeError, setShakeError] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    function startEditing() {
        setEditValue(session.title)
        setIsEditing(true)
        setIsDeleting(false)
    }

    function commitRename() {
        const trimmed = editValue.trim()
        if (trimmed.length === 0 || trimmed.length > 20) {
            setShakeError(true)
            setTimeout(() => setShakeError(false), 500)
            return
        }
        onRename(session.id, trimmed)
        setIsEditing(false)
    }

    if (isDeleting) {
        return (
            <div className='flex items-center justify-between px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10 animate-in fade-in duration-150'>
                <span className='text-xs text-slate-400'>确定删除？</span>
                <div className='flex gap-2'>
                    <button
                        type='button'
                        onClick={() => setIsDeleting(false)}
                        className='px-2 py-0.5 rounded text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors'
                    >
                        取消
                    </button>
                    <button
                        type='button'
                        onClick={() => {
                            onDelete(session.id)
                            setIsDeleting(false)
                        }}
                        className='px-2 py-0.5 rounded text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors'
                    >
                        确认删除
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className='relative group'>
            <button
                type='button'
                onClick={() => onSwitch(session.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors truncate ${
                    isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                }`}
            >
                {isEditing ? (
                    <div>
                        <input
                            ref={inputRef}
                            type='text'
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename()
                                if (e.key === 'Escape') setIsEditing(false)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className={`w-full bg-transparent border-b outline-none text-xs ${
                                shakeError || editValue.trim().length > 20
                                    ? 'border-red-500/60 text-red-300'
                                    : editValue.trim().length === 0
                                      ? 'border-red-500/40 text-red-300'
                                      : 'border-emerald-500/30 text-emerald-300'
                            }${shakeError ? ' animate-[shake_0.3s_ease-in-out]' : ''}`}
                        />
                        <div
                            className={`text-[10px] text-right mt-0.5 ${
                                editValue.trim().length > 20
                                    ? 'text-red-400'
                                    : 'text-slate-600'
                            }`}
                        >
                            {editValue.trim().length > 20 && (
                                <span className='mr-0.5'>✕</span>
                            )}
                            {editValue.trim().length}/20
                        </div>
                    </div>
                ) : (
                    <>
                        <div className='flex items-center gap-1.5'>
                            {session.symbol && (
                                <span className='shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'>
                                    {session.symbol}
                                </span>
                            )}
                            <span className='truncate'>{session.title}</span>
                        </div>
                        <div className='text-[10px] text-slate-600 mt-0.5'>
                            {formatRelativeTime(session.updatedAt)}
                        </div>
                    </>
                )}
            </button>
            {!isEditing && (
                <div
                    className={`absolute right-0 top-0 bottom-0 flex items-center gap-1 px-2 rounded-r-lg
                        opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200
                        pointer-events-none bg-gradient-to-l ${
                            isActive
                                ? 'from-emerald-950 via-emerald-950/95 to-transparent'
                                : 'from-[#030303] via-[#030303]/95 to-transparent'
                        }`}
                >
                    <button
                        type='button'
                        aria-label='重命名'
                        onClick={startEditing}
                        className='p-1.5 rounded text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors pointer-events-auto'
                    >
                        <Pencil size={12} />
                    </button>
                    <button
                        type='button'
                        aria-label='删除'
                        onClick={() => {
                            setIsDeleting(true)
                            setIsEditing(false)
                        }}
                        className='p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors pointer-events-auto'
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            )}
        </div>
    )
}
