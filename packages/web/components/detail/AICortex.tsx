'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Cpu, FileText, PieChart } from 'lucide-react'
import { TabButton } from './TabButton'
import { ReportTab } from './tabs/ReportTab'
import { FinanceTab } from './tabs/FinanceTab'
import { ContextInput } from './ContextInput'

const VALID_TABS = new Set<string>(['report', 'finance'])

interface AICortexProps {
    symbol: string
    assetName: string
    aiThinking?: boolean
}

export function AICortex({ symbol, assetName, aiThinking = false }: AICortexProps) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [inputValue, setInputValue] = useState('')

    const [activeTab, setActiveTab] = useState<'report' | 'finance'>(() => {
        const tab = searchParams.get('tab')
        return tab && VALID_TABS.has(tab) ? (tab as 'report' | 'finance') : 'report'
    })

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

            {/* Tab bar */}
            <div className='flex border-b border-white/5'>
                <TabButton
                    active={activeTab === 'report'}
                    onClick={() => setActiveTab('report')}
                    icon={FileText}
                    label='研报'
                />
                <TabButton
                    active={activeTab === 'finance'}
                    onClick={() => setActiveTab('finance')}
                    icon={PieChart}
                    label='财报'
                />
            </div>

            {/* Content */}
            <div className='flex-1 p-6 overflow-y-auto flex flex-col space-y-6 scrollbar-thin scrollbar-thumb-white/10'>
                {activeTab === 'report' && <ReportTab symbol={symbol} />}
                {activeTab === 'finance' && <FinanceTab symbol={symbol} />}
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
