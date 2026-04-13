'use client'

import { Cpu } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ContextInput } from './ContextInput'

interface AICortexProps {
    symbol: string
    assetName: string
    aiThinking?: boolean
}

export function AICortex({
    symbol,
    assetName,
    aiThinking = false,
}: AICortexProps) {
    const router = useRouter()
    const [inputValue, setInputValue] = useState('')

    const handleSend = () => {
        const text = inputValue.trim()
        if (!text) return

        const q = encodeURIComponent(text.slice(0, 500))
        router.push(`/chat?symbol=${symbol}&q=${q}`)
        setInputValue('')
    }

    return (
        <div className='flex-1 rounded-3xl border border-white/5 bg-[#050505] relative overflow-hidden flex flex-col shadow-2xl min-h-[600px] lg:min-h-0'>
            {/* Header */}
            <div className='p-6 border-b border-white/5 bg-white/[0.01]'>
                <div className='flex items-center gap-3'>
                    <Cpu
                        size={18}
                        className={`${aiThinking ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`}
                    />
                    <span className='text-sm font-medium text-white tracking-wide'>
                        Flux 智能核心
                    </span>
                </div>
            </div>

            {/* Always-visible input — redirects to /chat */}
            <ContextInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSend}
                isLoading={false}
                placeholder={`询问关于 ${assetName} 的问题...`}
            />
        </div>
    )
}
