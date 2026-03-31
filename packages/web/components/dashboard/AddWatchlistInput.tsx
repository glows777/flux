'use client'

import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface AddWatchlistInputProps {
    value: string
    onChange: (value: string) => void
    onSubmit: () => void
    onCancel: () => void
    isSubmitting: boolean
}

export function AddWatchlistInput({
    value,
    onChange,
    onSubmit,
    onCancel,
    isSubmitting,
}: AddWatchlistInputProps) {
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && value.trim()) {
            onSubmit()
        }
        if (e.key === 'Escape') {
            onCancel()
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value.toUpperCase())
    }

    return (
        <div className='h-16 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/[0.03] flex items-center px-6 gap-3'>
            <input
                ref={inputRef}
                type='text'
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                disabled={isSubmitting}
                placeholder='输入股票代码，如 AAPL'
                className='flex-1 bg-transparent text-white text-sm placeholder:text-slate-600 outline-none disabled:opacity-50'
            />
            <button
                onClick={onSubmit}
                disabled={isSubmitting || !value.trim()}
                className='p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed'
            >
                {isSubmitting ? (
                    <Loader2 size={16} className='animate-spin' />
                ) : (
                    <Check size={16} />
                )}
            </button>
            <button
                onClick={onCancel}
                disabled={isSubmitting}
                className='p-1.5 rounded-lg text-slate-500 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed'
            >
                <X size={16} />
            </button>
        </div>
    )
}
