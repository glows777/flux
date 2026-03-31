'use client'

import type { EarningsL2 } from '@/lib/finance/types'

// ─── Shimmer Skeleton ───

export function L2Shimmer() {
    return (
        <div className='animate-pulse space-y-4'>
            <div className='flex items-center gap-2'>
                <div className='w-2 h-2 rounded-full bg-emerald-500/50 animate-ping' />
                <span className='text-xs text-slate-400'>AI 分析中...</span>
            </div>
            <div className='h-20 bg-slate-800/30 rounded-xl' />
            <div className='h-16 bg-slate-800/30 rounded-xl' />
            <div className='h-24 bg-slate-800/30 rounded-xl' />
        </div>
    )
}

// ─── Signal/Tone Badge ───

const SIGNAL_COLORS: Record<string, string> = {
    '正面': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    '乐观': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    '中性': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    '谨慎': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

function Badge({ label }: { readonly label: string }) {
    const color = SIGNAL_COLORS[label] ?? SIGNAL_COLORS['中性']
    return (
        <span
            className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${color}`}
        >
            {label}
        </span>
    )
}

// ─── TLDR ───

function TldrSection({ tldr }: { readonly tldr: string }) {
    return (
        <div className='border-l-2 border-emerald-500/50 pl-3'>
            <h4 className='text-xs text-slate-400 font-medium mb-2'>TLDR</h4>
            <p className='text-sm text-slate-300 leading-relaxed'>{tldr}</p>
        </div>
    )
}

// ─── Guidance ───

function GuidanceSection({
    guidance,
}: {
    readonly guidance: EarningsL2['guidance']
}) {
    return (
        <div className='rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-3'>
            <div className='flex items-center justify-between'>
                <h4 className='text-xs text-slate-400 font-medium'>
                    指引解读
                </h4>
                <Badge label={guidance.signal} />
            </div>

            <div className='space-y-2'>
                <div>
                    <span className='text-xs text-slate-500'>营收指引：</span>
                    <span className='text-xs text-white'>
                        {guidance.nextQuarterRevenue}
                    </span>
                </div>
                <div className='flex items-center gap-2'>
                    <span className='text-xs text-slate-500'>全年调整：</span>
                    <Badge label={guidance.fullYearAdjustment} />
                </div>
            </div>

            <blockquote className='border-l border-white/10 pl-2 text-xs text-slate-400 italic'>
                &ldquo;{guidance.keyQuote}&rdquo;
            </blockquote>
        </div>
    )
}

// ─── Segments Table ───

function SegmentsSection({
    segments,
}: {
    readonly segments: EarningsL2['segments']
}) {
    return (
        <div className='rounded-xl border border-white/5 bg-white/[0.02] p-3'>
            <h4 className='text-xs text-slate-400 font-medium mb-3'>
                业务板块
            </h4>
            {segments.length === 0 ? (
                <p className='text-xs text-slate-500'>暂无板块数据</p>
            ) : (
                <div className='overflow-x-auto'>
                    <table className='w-full text-xs'>
                        <thead>
                            <tr className='text-slate-500 border-b border-white/5'>
                                <th className='text-left py-1.5 pr-2 font-normal'>
                                    板块
                                </th>
                                <th className='text-right py-1.5 px-2 font-normal'>
                                    营收
                                </th>
                                <th className='text-right py-1.5 px-2 font-normal'>
                                    YoY
                                </th>
                                <th className='text-left py-1.5 pl-2 font-normal'>
                                    点评
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {segments.map((seg) => (
                                <tr
                                    key={seg.name}
                                    className='text-slate-300 border-b border-white/[0.03]'
                                >
                                    <td className='py-1.5 pr-2 text-white font-medium'>
                                        {seg.name}
                                    </td>
                                    <td className='text-right py-1.5 px-2'>
                                        {seg.value}
                                    </td>
                                    <td className='text-right py-1.5 px-2'>
                                        {seg.yoy}
                                    </td>
                                    <td className='py-1.5 pl-2 text-slate-400'>
                                        {seg.comment}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

// ─── Management Signals ───

function ManagementSignalsSection({
    signals,
}: {
    readonly signals: EarningsL2['managementSignals']
}) {
    return (
        <div className='rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-3'>
            <div className='flex items-center justify-between'>
                <h4 className='text-xs text-slate-400 font-medium'>
                    管理层信号
                </h4>
                <Badge label={signals.tone} />
            </div>

            {/* Key Phrases */}
            {signals.keyPhrases.length > 0 && (
                <div className='flex flex-wrap gap-1.5'>
                    {signals.keyPhrases.map((phrase) => (
                        <span
                            key={phrase}
                            className='px-2 py-0.5 rounded-full bg-white/5 text-xs text-slate-300 border border-white/5'
                        >
                            {phrase}
                        </span>
                    ))}
                </div>
            )}

            {/* Quotes */}
            {signals.quotes.length > 0 && (
                <div className='space-y-2'>
                    {signals.quotes.map((quote, i) => (
                        <blockquote
                            key={i}
                            className='border-l border-white/10 pl-2 space-y-0.5'
                        >
                            <p className='text-xs text-slate-300 italic'>
                                &ldquo;{quote.en}&rdquo;
                            </p>
                            <p className='text-xs text-slate-500'>
                                {quote.cn}
                            </p>
                        </blockquote>
                    ))}
                </div>
            )}

            {/* Analyst Focus */}
            {signals.analystFocus.length > 0 && (
                <div>
                    <span className='text-xs text-slate-500 block mb-1.5'>
                        分析师焦点
                    </span>
                    <div className='flex flex-wrap gap-1.5'>
                        {signals.analystFocus.map((topic) => (
                            <span
                                key={topic}
                                className='px-2 py-0.5 rounded-full bg-emerald-500/5 text-xs text-emerald-400/80 border border-emerald-500/10'
                            >
                                {topic}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── L2Section ───

interface L2SectionProps {
    readonly data: EarningsL2
}

export function L2Section({ data }: L2SectionProps) {
    return (
        <div className='space-y-4'>
            <TldrSection tldr={data.tldr} />
            <GuidanceSection guidance={data.guidance} />
            <SegmentsSection segments={data.segments} />
            <ManagementSignalsSection signals={data.managementSignals} />

            {/* Suggested Questions */}
            {data.suggestedQuestions.length > 0 && (
                <div className='space-y-2'>
                    <h4 className='text-xs text-slate-400 font-medium'>
                        延伸问题
                    </h4>
                    <div className='flex flex-wrap gap-2'>
                        {data.suggestedQuestions.map((q) => (
                            <span
                                key={q}
                                className='px-2.5 py-1 rounded-lg bg-white/[0.03] text-xs text-slate-300 border border-white/5'
                            >
                                {q}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
