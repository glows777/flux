'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import type { Components } from 'react-markdown'
import { RefreshCw, Zap, Activity } from 'lucide-react'
import Markdown from 'react-markdown'
import { client } from '@/lib/api'

interface ReportTabProps {
    symbol: string
}

interface ReportSection {
    title: string
    content: string
}

function parseReportSections(markdown: string): ReportSection[] {
    const parts = markdown.split(/^## /m).filter(Boolean)
    return parts.map((part) => {
        const newlineIndex = part.indexOf('\n')
        if (newlineIndex === -1) return { title: part.trim(), content: '' }
        return {
            title: part.slice(0, newlineIndex).trim(),
            content: part.slice(newlineIndex + 1).trim(),
        }
    })
}

function getSectionStyle(title: string): {
    bg: string
    border: string
    titleColor: string
    icon: ReactNode | null
} {
    if (title.includes('核心观点')) {
        return {
            bg: 'bg-emerald-500/5',
            border: 'border-emerald-500/10',
            titleColor: 'text-emerald-400',
            icon: <Zap size={14} />,
        }
    }
    if (title.includes('风险提示')) {
        return {
            bg: 'bg-rose-500/5',
            border: 'border-rose-500/10',
            titleColor: 'text-rose-400',
            icon: <Activity size={14} />,
        }
    }
    return {
        bg: 'bg-white/[0.02]',
        border: 'border-white/5',
        titleColor: 'text-slate-400',
        icon: null,
    }
}

// Sanitize links to prevent javascript: XSS
const markdownComponents: Components = {
    a: ({ href, children }) => (
        <a
            href={href && /^https?:\/\//.test(href) ? href : '#'}
            target='_blank'
            rel='noopener noreferrer'
        >
            {children}
        </a>
    ),
}

function SectionCard({ title, children }: { readonly title: string; readonly children: ReactNode }) {
    const style = getSectionStyle(title)
    return (
        <div className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
            <div className={`flex items-center gap-2 mb-2 text-sm font-medium ${style.titleColor}`}>
                {style.icon}
                <span>{title}</span>
            </div>
            <div className='prose prose-invert prose-sm max-w-none text-slate-300'>
                {children}
            </div>
        </div>
    )
}

export function ReportTab({ symbol }: ReportTabProps) {
    const [isRefreshing, setIsRefreshing] = useState(false)

    const { data: report, error, isLoading, mutate } = useSWR(
        `/api/stocks/${encodeURIComponent(symbol)}/report`,
        async () => {
            const res = await client.api.stocks[':symbol'].report.$post({
                param: { symbol },
                json: {},
            })
            const json = await res.json()
            if (!json.success) throw new Error(json.error)
            return json.data
        },
    )

    const handleRefresh = async () => {
        setIsRefreshing(true)
        try {
            const res = await client.api.stocks[':symbol'].report.$post({
                param: { symbol },
                json: { forceRefresh: true },
            })
            const json = await res.json()
            if (!json.success) throw new Error(json.error)
            mutate(json.data, false)
        } finally {
            setIsRefreshing(false)
        }
    }

    if (isLoading) {
        return (
            <div className='flex flex-col gap-3 animate-pulse pt-10'>
                <div className='h-2 w-3/4 bg-slate-800 rounded' />
                <div className='h-2 w-1/2 bg-slate-800 rounded' />
                <div className='h-20 w-full bg-slate-800/50 rounded mt-4' />
            </div>
        )
    }

    if (error) {
        return <div className='text-red-400'>研报生成失败</div>
    }

    return (
        <div className='space-y-4'>
            {/* 头部：缓存状态 + 刷新按钮 */}
            <div className='flex items-center justify-between text-sm text-gray-400'>
                <span>
                    {report?.cached ? '来自缓存' : '新生成'}
                    {' · '}
                    {report?.createdAt
                        ? new Date(report.createdAt).toLocaleString()
                        : ''}
                </span>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className='flex items-center gap-1 hover:text-white transition'
                >
                    <RefreshCw
                        className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                    重新生成
                </button>
            </div>

            {/* 研报内容 */}
            {report?.content && (
                <div className='space-y-3'>
                    {parseReportSections(report.content).map((section) => (
                        <SectionCard key={section.title} title={section.title}>
                            <Markdown components={markdownComponents}>{section.content}</Markdown>
                        </SectionCard>
                    ))}
                </div>
            )}
        </div>
    )
}
