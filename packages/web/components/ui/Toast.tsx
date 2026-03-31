'use client'

import { useCallback, useEffect, useState } from 'react'

interface ToastState {
    message: string
    visible: boolean
}

let showToastFn: ((message: string) => void) | null = null

export function showToast(message: string) {
    showToastFn?.(message)
}

export function ToastProvider() {
    const [toast, setToast] = useState<ToastState>({
        message: '',
        visible: false,
    })

    const show = useCallback((message: string) => {
        setToast({ message, visible: true })
    }, [])

    useEffect(() => {
        showToastFn = show
        return () => {
            showToastFn = null
        }
    }, [show])

    useEffect(() => {
        if (!toast.visible) return
        const timer = setTimeout(() => {
            setToast((prev) => ({ ...prev, visible: false }))
        }, 2000)
        return () => clearTimeout(timer)
    }, [toast.visible])

    if (!toast.visible) return null

    return (
        <div className='fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-fade-in'>
            <div className='px-4 py-2 rounded-lg bg-white/10 border border-white/10 backdrop-blur-md text-sm text-white'>
                {toast.message}
            </div>
        </div>
    )
}
