'use client'

import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    LoaderCircle,
    RefreshCcw,
    Sparkles,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type {
    MessageContextRecord,
    MessageContextSegment,
    MessageContextState,
} from '@/lib/ai/context-visibility'
import {
    buildContextTriggerLabel,
    formatSegmentSource,
    formatSerializableContent,
} from '@/lib/ai/context-visibility'

export interface MessageContextPanelProps {
    readonly state: MessageContextState
    readonly isOpen: boolean
    readonly onToggle: () => void
    readonly onRetry?: () => void
}

function badgeClassName(kind: 'neutral' | 'emerald' | 'warning' | 'rose') {
    switch (kind) {
        case 'emerald':
            return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
        case 'warning':
            return 'border-amber-500/20 bg-amber-500/10 text-amber-200'
        case 'rose':
            return 'border-rose-500/20 bg-rose-500/10 text-rose-200'
        default:
            return 'border-white/10 bg-white/[0.04] text-slate-300'
    }
}

function Badge({
    children,
    tone = 'neutral',
}: {
    readonly children: string
    readonly tone?: 'neutral' | 'emerald' | 'warning' | 'rose'
}) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-none ${badgeClassName(tone)}`}
        >
            {children}
        </span>
    )
}

function Section({
    title,
    kicker,
    children,
}: {
    readonly title: string
    readonly kicker?: string
    readonly children: ReactNode
}) {
    return (
        <section className='rounded-2xl border border-white/8 bg-white/[0.025] p-4'>
            <div className='mb-3 flex items-start justify-between gap-3'>
                <div>
                    <h3 className='text-sm font-medium text-slate-100'>
                        {title}
                    </h3>
                    {kicker ? (
                        <p className='mt-1 text-xs text-slate-500'>{kicker}</p>
                    ) : null}
                </div>
            </div>
            {children}
        </section>
    )
}

function JsonBlock({
    value,
    emptyLabel = '—',
}: {
    readonly value: unknown
    readonly emptyLabel?: string
}) {
    const text = formatSerializableContent(value)
    if (!text) {
        return <p className='text-sm text-slate-500'>{emptyLabel}</p>
    }

    return (
        <pre className='whitespace-pre-wrap break-words rounded-xl border border-white/5 bg-black/30 p-3 font-mono text-[12px] leading-5 text-slate-300'>
            {text}
        </pre>
    )
}

function SegmentContent({
    segment,
}: {
    readonly segment: MessageContextSegment
}) {
    if (segment.payload.format === 'text') {
        return (
            <JsonBlock value={segment.payload.text} emptyLabel='Empty text' />
        )
    }

    return (
        <div className='space-y-2'>
            {segment.payload.messages.map((message) => (
                <div
                    key={message.id}
                    className='rounded-xl border border-white/5 bg-black/20 p-3'
                >
                    <div className='flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                        <span>{message.role}</span>
                        <span>{message.id}</span>
                    </div>
                    <div className='mt-2'>
                        <JsonBlock value={message} emptyLabel='Empty message' />
                    </div>
                </div>
            ))}
        </div>
    )
}

function SegmentCard({ segment }: { readonly segment: MessageContextSegment }) {
    const metadata = [
        segment.kind,
        segment.target,
        segment.priority,
        segment.cacheability,
        segment.compactability,
        formatSegmentSource(segment.source),
    ]

    if (segment.included != null) {
        metadata.push(segment.included ? 'included' : 'excluded')
    }
    if (segment.finalOrder != null) {
        metadata.push(`order ${segment.finalOrder}`)
    }
    if (segment.estimatedTokens != null) {
        metadata.push(`${segment.estimatedTokens} tokens`)
    }

    return (
        <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
            <div className='flex flex-wrap items-center gap-2'>
                <p className='text-sm font-medium text-slate-100'>
                    {segment.id}
                </p>
                {metadata.map((item) => (
                    <Badge key={`${segment.id}-${item}`}>{item}</Badge>
                ))}
            </div>
            <div className='mt-3'>
                <SegmentContent segment={segment} />
            </div>
        </div>
    )
}

function SummaryGrid({ record }: { readonly record: MessageContextRecord }) {
    const manifest = record.manifest
    const assembled = manifest.assembledContext
    const result = manifest.result
    const providerUsage = result?.usage
        ? `${result.usage.inputTokens ?? 0} in / ${result.usage.outputTokens ?? 0} out`
        : 'No usage reported'
    const hasMemory = assembled.segments.some(
        (segment) => segment.kind === 'memory.long_lived',
    )
    const hasRuntime = assembled.segments.some(
        (segment) => segment.kind === 'live.runtime',
    )

    const values = [
        { label: 'Version', value: String(record.version) },
        { label: 'Run ID', value: record.runId },
        {
            label: 'Messages',
            value: String(manifest.input.rawMessages.length),
        },
        {
            label: 'Segments',
            value: String(assembled.segments.length),
        },
        {
            label: 'Tools',
            value: String(assembled.tools.length),
        },
        {
            label: 'Input tokens',
            value: String(assembled.totalEstimatedInputTokens),
        },
        { label: 'Provider usage', value: providerUsage },
        { label: 'Memory', value: hasMemory ? 'Included' : 'Not included' },
        {
            label: 'Runtime context',
            value: hasRuntime ? 'Included' : 'Not included',
        },
    ]

    return (
        <div className='grid gap-3 md:grid-cols-3'>
            {values.map((item) => (
                <div
                    key={item.label}
                    className='rounded-2xl border border-white/6 bg-black/20 p-3'
                >
                    <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                        {item.label}
                    </p>
                    <p className='mt-2 text-sm text-slate-200'>{item.value}</p>
                </div>
            ))}
            <div className='rounded-2xl border border-white/6 bg-black/20 p-3 md:col-span-3'>
                <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                    Result
                </p>
                <p className='mt-2 text-sm text-slate-200'>
                    {result
                        ? 'Completed with a response snapshot.'
                        : 'No final result snapshot yet.'}
                </p>
            </div>
        </div>
    )
}

function ToolCard({
    tool,
}: {
    readonly tool: MessageContextRecord['manifest']['assembledContext']['tools'][number]
}) {
    return (
        <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
            <div className='flex flex-wrap items-center gap-2'>
                <p className='text-sm font-medium text-slate-100'>
                    {tool.name}
                </p>
                <Badge tone='emerald'>{tool.source}</Badge>
                {tool.estimatedTokens != null ? (
                    <Badge>{tool.estimatedTokens} tokens</Badge>
                ) : null}
            </div>
            <div className='mt-3 grid gap-3 md:grid-cols-2'>
                <div>
                    <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                        Description
                    </p>
                    <div className='mt-2'>
                        <JsonBlock
                            value={tool.manifestSpec.description ?? ''}
                            emptyLabel='No description'
                        />
                    </div>
                </div>
                <div>
                    <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                        Input schema summary
                    </p>
                    <div className='mt-2'>
                        <JsonBlock
                            value={tool.manifestSpec.inputSchemaSummary}
                            emptyLabel='No schema summary'
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

function LoadingState() {
    return (
        <div className='flex items-center gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100'>
            <LoaderCircle size={16} className='animate-spin text-emerald-300' />
            <span>Loading context...</span>
        </div>
    )
}

function UnavailableState() {
    return (
        <div className='flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300'>
            <Sparkles size={16} className='mt-0.5 text-emerald-300' />
            <div>
                <p className='font-medium text-slate-100'>
                    Context unavailable
                </p>
                <p className='mt-1 text-slate-500'>
                    This message does not have a saved context manifest yet.
                </p>
            </div>
        </div>
    )
}

function ErrorState({
    error,
    onRetry,
}: {
    readonly error: string
    readonly onRetry?: () => void
}) {
    return (
        <div className='flex items-start gap-3 rounded-2xl border border-rose-500/15 bg-rose-500/8 px-4 py-3 text-sm text-rose-100'>
            <AlertTriangle size={16} className='mt-0.5 text-rose-300' />
            <div className='min-w-0 flex-1'>
                <p className='font-medium text-rose-50'>Context error</p>
                <p className='mt-1 text-rose-100/80'>{error}</p>
                {onRetry ? (
                    <button
                        type='button'
                        onClick={onRetry}
                        className='mt-3 inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-50 transition-colors hover:bg-rose-500/15'
                    >
                        <RefreshCcw size={12} />
                        Retry
                    </button>
                ) : null}
            </div>
        </div>
    )
}

function ReadyState({ record }: { readonly record: MessageContextRecord }) {
    const manifest = record.manifest

    return (
        <div className='space-y-4'>
            <Section
                title='Summary'
                kicker='High-level run snapshot with counts and result status.'
            >
                <SummaryGrid record={record} />
            </Section>

            <Section
                title='Assembled Context'
                kicker='Rendered as segmented cards so raw content stays readable.'
            >
                <div className='space-y-4'>
                    <div className='space-y-3'>
                        {manifest.assembledContext.segments.length > 0 ? (
                            manifest.assembledContext.segments.map(
                                (segment) => (
                                    <SegmentCard
                                        key={segment.id}
                                        segment={segment}
                                    />
                                ),
                            )
                        ) : (
                            <p className='text-sm text-slate-500'>
                                No assembled segments.
                            </p>
                        )}
                    </div>

                    <div className='grid gap-4 xl:grid-cols-[1.3fr_0.7fr]'>
                        <div className='space-y-3'>
                            <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                                <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                    Tools
                                </p>
                                <div className='mt-3 space-y-3'>
                                    {manifest.assembledContext.tools.length >
                                    0 ? (
                                        manifest.assembledContext.tools.map(
                                            (tool) => (
                                                <ToolCard
                                                    key={`${tool.source}-${tool.name}`}
                                                    tool={tool}
                                                />
                                            ),
                                        )
                                    ) : (
                                        <p className='text-sm text-slate-500'>
                                            No assembled tools.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className='space-y-3'>
                            <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                                <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                    Parameter candidates
                                </p>
                                <div className='mt-2'>
                                    <JsonBlock
                                        value={
                                            manifest.assembledContext.params
                                                .candidates
                                        }
                                        emptyLabel='No parameter candidates'
                                    />
                                </div>
                            </div>
                            <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                                <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                    Resolved parameters
                                </p>
                                <div className='mt-2'>
                                    <JsonBlock
                                        value={
                                            manifest.assembledContext.params
                                                .resolved
                                        }
                                        emptyLabel='No resolved parameters'
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            <Section
                title='Plugin Outputs'
                kicker='Raw plugin outputs with one card per producer.'
            >
                <div className='space-y-3'>
                    {manifest.pluginOutputs.map((entry) => (
                        <div
                            key={entry.plugin}
                            className='rounded-2xl border border-white/6 bg-black/20 p-3'
                        >
                            <div className='flex flex-wrap items-center gap-2'>
                                <p className='text-sm font-medium text-slate-100'>
                                    {entry.plugin}
                                </p>
                                <Badge tone='emerald'>plugin output</Badge>
                            </div>
                            <div className='mt-3'>
                                <JsonBlock
                                    value={entry.output}
                                    emptyLabel='No plugin output'
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            <Section
                title='Model Request'
                kicker='The assembled request sent to the model.'
            >
                <div className='space-y-3'>
                    <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                        <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                            System text
                        </p>
                        <div className='mt-2'>
                            <JsonBlock
                                value={manifest.modelRequest.systemText}
                                emptyLabel='No system text'
                            />
                        </div>
                    </div>

                    <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                        <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                            Tool names
                        </p>
                        <div className='mt-2 flex flex-wrap gap-2'>
                            {manifest.modelRequest.toolNames.length > 0 ? (
                                manifest.modelRequest.toolNames.map((name) => (
                                    <Badge key={name} tone='emerald'>
                                        {name}
                                    </Badge>
                                ))
                            ) : (
                                <p className='text-sm text-slate-500'>None</p>
                            )}
                        </div>
                    </div>

                    <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                        <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                            Model messages
                        </p>
                        <div className='mt-3 space-y-2'>
                            {manifest.modelRequest.modelMessages.map(
                                (message) => (
                                    <div
                                        key={message.id}
                                        className='rounded-xl border border-white/5 bg-black/20 p-3'
                                    >
                                        <div className='flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                            <span>{message.role}</span>
                                            <span>{message.id}</span>
                                        </div>
                                        <div className='mt-2'>
                                            <JsonBlock value={message} />
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>

                    <div className='grid gap-3 md:grid-cols-2'>
                        <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                            <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                Resolved params
                            </p>
                            <div className='mt-2'>
                                <JsonBlock
                                    value={manifest.modelRequest.resolvedParams}
                                />
                            </div>
                        </div>
                        <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                            <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                Provider options
                            </p>
                            <div className='mt-2'>
                                <JsonBlock
                                    value={
                                        manifest.modelRequest.providerOptions
                                    }
                                />
                            </div>
                        </div>
                    </div>

                    <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                        <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                            Max output tokens
                        </p>
                        <div className='mt-2'>
                            <JsonBlock
                                value={manifest.modelRequest.maxOutputTokens}
                                emptyLabel='Not set'
                            />
                        </div>
                    </div>
                </div>
            </Section>

            <Section
                title='Result'
                kicker='The final answer and response metadata.'
            >
                {manifest.result ? (
                    <div className='space-y-3'>
                        <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                            <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                Text
                            </p>
                            <div className='mt-2'>
                                <JsonBlock value={manifest.result.text} />
                            </div>
                        </div>

                        <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                            <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                Response message
                            </p>
                            <div className='mt-2'>
                                <JsonBlock
                                    value={manifest.result.responseMessage}
                                />
                            </div>
                        </div>

                        <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                            <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                Tool calls
                            </p>
                            <div className='mt-3 space-y-2'>
                                {manifest.result.toolCalls.length > 0 ? (
                                    manifest.result.toolCalls.map(
                                        (call, index) => (
                                            <div
                                                key={`${call.toolName}-${index}`}
                                                className='rounded-xl border border-white/5 bg-black/20 p-3'
                                            >
                                                <div className='flex flex-wrap items-center gap-2'>
                                                    <p className='text-sm font-medium text-slate-100'>
                                                        {call.toolName}
                                                    </p>
                                                    <Badge tone='emerald'>
                                                        call
                                                    </Badge>
                                                </div>
                                                <div className='mt-2'>
                                                    <JsonBlock value={call} />
                                                </div>
                                            </div>
                                        ),
                                    )
                                ) : (
                                    <p className='text-sm text-slate-500'>
                                        No tool calls.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className='grid gap-3 md:grid-cols-2'>
                            <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                                <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                    Usage
                                </p>
                                <div className='mt-2'>
                                    <JsonBlock value={manifest.result.usage} />
                                </div>
                            </div>
                            <div className='rounded-2xl border border-white/6 bg-black/20 p-3'>
                                <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                                    Output preview
                                </p>
                                <div className='mt-2'>
                                    <JsonBlock value={manifest.result.text} />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className='text-sm text-slate-500'>
                        The run has not produced a final result snapshot yet.
                    </p>
                )}
            </Section>
        </div>
    )
}

export function MessageContextPanel({
    state,
    isOpen,
    onToggle,
    onRetry,
}: MessageContextPanelProps) {
    return (
        <aside className='rounded-3xl border border-emerald-500/15 bg-[#050505] text-slate-200 shadow-[0_0_0_1px_rgba(16,185,129,0.05)]'>
            <button
                type='button'
                aria-expanded={isOpen}
                onClick={onToggle}
                className='flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]'
            >
                <div className='flex items-center gap-3 min-w-0'>
                    <span className='flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300'>
                        <Sparkles size={14} />
                    </span>
                    <div className='min-w-0'>
                        <p className='text-sm font-medium text-slate-100'>
                            {buildContextTriggerLabel(state)}
                        </p>
                        <p className='text-xs text-slate-500'>
                            Inline context inspector
                        </p>
                    </div>
                </div>
                <div className='flex items-center gap-2 text-slate-500'>
                    <Badge tone='emerald'>{state.status}</Badge>
                    {isOpen ? (
                        <ChevronDown size={16} />
                    ) : (
                        <ChevronRight size={16} />
                    )}
                </div>
            </button>

            {isOpen ? (
                <div className='space-y-4 p-4'>
                    {state.status === 'idle' ? (
                        <div className='rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-400'>
                            Pick a message to inspect its saved context.
                        </div>
                    ) : null}

                    {state.status === 'loading' ? <LoadingState /> : null}

                    {state.status === 'unavailable' ? (
                        <UnavailableState />
                    ) : null}

                    {state.status === 'error' ? (
                        <ErrorState error={state.error} onRetry={onRetry} />
                    ) : null}

                    {state.status === 'ready' ? (
                        <ReadyState record={state.record} />
                    ) : null}
                </div>
            ) : null}
        </aside>
    )
}
