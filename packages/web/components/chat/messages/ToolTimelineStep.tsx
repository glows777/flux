'use client'

import type { LucideIcon } from 'lucide-react'
import {
    Activity,
    BarChart2,
    Briefcase,
    Clock,
    DollarSign,
    ExternalLink,
    File,
    FileText,
    Globe,
    List,
    Loader2,
    Newspaper,
    Save,
    Search,
    X,
} from 'lucide-react'
import { getCompletionSummary, getLoadingLabel } from '@/lib/ai/tool-display'
import type { TimelineStep } from '@/lib/ai/tool-timeline'
import { ToolFetchLink } from './ToolFetchLink'
import { ToolMemoryResults } from './ToolMemoryResults'
import { ToolSearchResults } from './ToolSearchResults'

// Static map from tool name to icon component — avoids `import * as LucideIcons`
const ICON_COMPONENTS: Record<string, LucideIcon> = {
    getQuote: DollarSign,
    getCompanyInfo: Briefcase,
    getNews: Newspaper,
    getHistory: BarChart2,
    calculateIndicators: Activity,
    getReport: FileText,
    searchStock: Search,
    webSearch: Globe,
    webFetch: ExternalLink,
    memory_read: File,
    memory_write: Save,
    memory_append: Save,
    memory_search: Search,
    memory_list: List,
}

function StepIcon({ step }: { readonly step: TimelineStep }) {
    if (step.state === 'running' || step.state === 'pending') {
        return <Loader2 size={15} className='animate-spin text-emerald-400' />
    }
    if (step.state === 'error') {
        return <X size={15} className='text-red-400' />
    }
    if (step.type === 'thinking') {
        return <Clock size={15} className='text-slate-500' />
    }
    const IconComponent = step.toolName
        ? ICON_COMPONENTS[step.toolName]
        : undefined
    if (IconComponent) {
        return <IconComponent size={15} className='text-slate-500' />
    }
    return (
        <div className='w-[15px] h-[15px] rounded-full border border-slate-600' />
    )
}

function getString(input: unknown, key: string): string | undefined {
    if (input && typeof input === 'object' && key in input) {
        const val = (input as Record<string, unknown>)[key]
        if (typeof val === 'string') return val
    }
    return undefined
}

function ThinkingStep({ step }: { readonly step: TimelineStep }) {
    return (
        <p className='text-[13px] text-slate-500 leading-relaxed m-0'>
            {step.text}
        </p>
    )
}

function WebSearchStep({ step }: { readonly step: TimelineStep }) {
    const query = getString(step.input, 'query')
    const sources =
        step.output &&
        typeof step.output === 'object' &&
        'sources' in step.output
            ? ((step.output as Record<string, unknown>).sources as Array<{
                  title: string
                  url: string
                  score: number
              }>)
            : []

    return (
        <div>
            <div className='flex items-center justify-between'>
                <span className='text-[13px] text-slate-300'>
                    {query ? `"${query}"` : '搜索互联网'}
                </span>
                {sources.length > 0 && (
                    <span className='text-xs text-slate-600'>
                        {sources.length} results
                    </span>
                )}
            </div>
            {step.state === 'done' && <ToolSearchResults sources={sources} />}
        </div>
    )
}

function MemorySearchStep({ step }: { readonly step: TimelineStep }) {
    const query =
        getString(step.input, 'query') ?? getString(step.input, 'symbol')
    const results =
        step.output &&
        typeof step.output === 'object' &&
        'results' in step.output
            ? ((step.output as Record<string, unknown>).results as Array<{
                  docPath: string
                  content: string
                  score: number
                  entities: readonly string[]
              }>)
            : []

    return (
        <div>
            <div className='flex items-center justify-between'>
                <span className='text-[13px] text-slate-400'>
                    {query ? `回忆关于 ${query} 的记录` : '回忆上下文'}
                </span>
                {results.length > 0 && (
                    <span className='text-xs text-slate-600'>
                        {results.length} 条记录
                    </span>
                )}
            </div>
            {step.state === 'done' && <ToolMemoryResults results={results} />}
        </div>
    )
}

function WebFetchStep({ step }: { readonly step: TimelineStep }) {
    const url = getString(step.input, 'url') ?? ''
    const title =
        step.output && typeof step.output === 'object'
            ? (getString(step.output, 'title') ?? getString(step.output, 'url'))
            : undefined

    return <ToolFetchLink url={url} title={title} />
}

function MemoryReadStep({ step }: { readonly step: TimelineStep }) {
    const label = getLoadingLabel(step.toolName ?? '', step.input)
    const summary =
        step.state === 'done'
            ? getCompletionSummary(step.toolName ?? '', step.output)
            : null
    return (
        <div className='flex items-center gap-2'>
            <span className='text-[13px] text-slate-400'>{label}</span>
            {summary && (
                <>
                    <span className='text-slate-600 text-xs'>·</span>
                    <span className='text-[13px] text-slate-300'>
                        {summary}
                    </span>
                </>
            )}
        </div>
    )
}

function MemoryWriteStep({ step }: { readonly step: TimelineStep }) {
    const docPath = getString(step.input, 'docPath')
    const docName = docPath ? docPath.split('/').pop() : undefined
    return (
        <span className='text-[13px] text-slate-600'>
            已保存 {docName ? `"${docName}"` : '笔记'}
        </span>
    )
}

function DataToolStep({ step }: { readonly step: TimelineStep }) {
    const label = getLoadingLabel(step.toolName ?? '', step.input)
    const summary =
        step.state === 'done'
            ? getCompletionSummary(step.toolName ?? '', step.output)
            : null

    return (
        <div className='flex items-center gap-2'>
            <span className='text-[13px] text-slate-400'>{label}</span>
            {summary && (
                <>
                    <span className='text-slate-600 text-xs'>·</span>
                    <span className='text-[13px] text-emerald-400'>
                        {summary}
                    </span>
                </>
            )}
        </div>
    )
}

function ErrorStep({ step }: { readonly step: TimelineStep }) {
    const label = getLoadingLabel(step.toolName ?? '', step.input)
    const truncated =
        step.errorText && step.errorText.length > 50
            ? `${step.errorText.slice(0, 50)}...`
            : (step.errorText ?? '未知错误')
    return (
        <div className='flex items-center gap-2'>
            <span className='text-[13px] text-slate-400'>{label}</span>
            <span className='text-slate-600 text-xs'>·</span>
            <span className='text-[13px] text-red-400'>{truncated}</span>
        </div>
    )
}

function StepContent({ step }: { readonly step: TimelineStep }) {
    if (step.state === 'error') return <ErrorStep step={step} />
    if (step.type === 'thinking') return <ThinkingStep step={step} />

    switch (step.toolName) {
        case 'webSearch':
            return <WebSearchStep step={step} />
        case 'memory_search':
            return <MemorySearchStep step={step} />
        case 'webFetch':
            return <WebFetchStep step={step} />
        case 'memory_read':
        case 'memory_list':
            return <MemoryReadStep step={step} />
        case 'memory_write':
        case 'memory_append':
            return <MemoryWriteStep step={step} />
        default:
            return <DataToolStep step={step} />
    }
}

export function ToolTimelineStep({ step }: { readonly step: TimelineStep }) {
    return (
        <div className='relative pb-4 last:pb-0'>
            {/* Icon on the vertical line */}
            <div className='absolute -left-8 top-0.5 w-6 h-6 flex items-center justify-center bg-[#0a0a0a] z-10'>
                <StepIcon step={step} />
            </div>

            {/* Step content */}
            <div className='animate-in fade-in slide-in-from-top-1 duration-200'>
                <StepContent step={step} />
            </div>
        </div>
    )
}
