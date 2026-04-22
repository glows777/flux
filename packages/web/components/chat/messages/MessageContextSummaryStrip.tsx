'use client'

import type { MessageContextState } from '@/lib/ai/context-visibility'
import { buildMessageContextSummaryModel } from '@/lib/ai/context-visibility'

export interface MessageContextSummaryStripProps {
    readonly state: MessageContextState
    readonly isSelected: boolean
    readonly onOpen: () => void
    readonly onRetry?: () => void
}

function chipToneClassName(
    tone: 'neutral' | 'emerald' | 'warning' | 'rose',
) {
    switch (tone) {
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

function Chip({
    label,
    tone,
}: {
    readonly label: string
    readonly tone: 'neutral' | 'emerald' | 'warning' | 'rose'
}) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-none ${chipToneClassName(tone)}`}
        >
            {label}
        </span>
    )
}

export function MessageContextSummaryStrip({
    state,
    isSelected,
    onOpen,
    onRetry,
}: MessageContextSummaryStripProps) {
    const model = buildMessageContextSummaryModel(state, { isSelected })
    const isError = state.status === 'error'
    const canRetry = !isError || onRetry != null
    const onClick = isError
        ? onRetry ?? undefined
        : onOpen

    return (
        <div
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-sm backdrop-blur-sm transition-colors ${
                isSelected
                    ? 'border-emerald-500/25 bg-emerald-500/8 ring-1 ring-emerald-500/20'
                    : 'border-white/8 bg-white/[0.025]'
            }`}
        >
            <div className='min-w-0 flex-1 space-y-1'>
                <div className='flex flex-wrap items-center gap-1.5'>
                    {model.chips.map((chip) => (
                        <Chip
                            key={chip.label}
                            label={chip.label}
                            tone={chip.tone}
                        />
                    ))}
                </div>
                <p className='text-xs text-slate-400'>{model.statsLine}</p>
            </div>
            <button
                type='button'
                {...(state.status === 'error'
                    ? {}
                    : { 'aria-pressed': isSelected })}
                disabled={!canRetry}
                onClick={onClick}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    !canRetry
                        ? 'cursor-not-allowed border-rose-500/10 bg-rose-500/5 text-rose-300/60'
                        : state.status === 'error'
                        ? 'border-rose-500/20 bg-rose-500/10 text-rose-200 hover:border-rose-400/30 hover:bg-rose-500/15'
                        : isSelected
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400/30 hover:bg-emerald-500/15'
                          : 'border-white/10 bg-black/20 text-slate-200 hover:border-white/20 hover:bg-white/[0.04]'
                }`}
            >
                {model.actionLabel}
            </button>
        </div>
    )
}
