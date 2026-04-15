'use client'

interface SignalBadgesProps {
    readonly data: {
        readonly symbol: string
        readonly signals: readonly {
            readonly name: string
            readonly type: 'bullish' | 'bearish' | 'neutral'
            readonly strength: 'strong' | 'moderate' | 'weak'
            readonly detail?: string
        }[]
        readonly overallBias: 'bullish' | 'bearish' | 'neutral'
    }
}

const TYPE_COLORS: Record<string, string> = {
    bullish: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    bearish: 'text-red-400 bg-red-500/10 border-red-500/20',
    neutral: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
}

const BIAS_LABELS: Record<string, string> = {
    bullish: '偏多',
    bearish: '偏空',
    neutral: '中性',
}

const STRENGTH_LABELS: Record<string, string> = {
    strong: '强',
    moderate: '中',
    weak: '弱',
}

export function SignalBadges({ data }: SignalBadgesProps) {
    if (!data?.signals?.length) return null

    const biasColor = TYPE_COLORS[data.overallBias] ?? TYPE_COLORS.neutral

    return (
        <div className='my-3 rounded-xl border border-white/5 bg-white/[0.02] p-4'>
            {/* 标题 + 综合偏向 */}
            <div className='flex items-center justify-between mb-3'>
                <span className='text-xs text-slate-400'>
                    {data.symbol} 技术信号
                </span>
                <span
                    className={`px-2 py-0.5 rounded text-xs border ${biasColor}`}
                >
                    综合 {BIAS_LABELS[data.overallBias] ?? '中性'}
                </span>
            </div>

            {/* 信号徽章列表 */}
            <div className='flex flex-wrap gap-2'>
                {data.signals.map((signal) => {
                    const colorClasses =
                        TYPE_COLORS[signal.type] ?? TYPE_COLORS.neutral
                    return (
                        <div
                            key={`${signal.name}-${signal.strength}`}
                            className={`px-2 py-1 rounded-lg border text-xs ${colorClasses}`}
                            title={signal.detail}
                        >
                            <span>{signal.name}</span>
                            <span className='ml-1 opacity-60'>
                                ({STRENGTH_LABELS[signal.strength] ?? '中'})
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
