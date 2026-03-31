interface SignalBadgeProps {
    signal: string
}

/**
 * 信号标签
 * 根据信号类型显示不同颜色
 */
export function SignalBadge({ signal }: SignalBadgeProps) {
    const getSignalStyles = (signal: string): string => {
        const bullishSignals = ['强力看涨', '看涨', '机构吸筹']
        const volatileSignals = ['高波动']

        if (bullishSignals.includes(signal)) {
            return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }

        if (volatileSignals.includes(signal)) {
            return 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        }

        return 'bg-slate-500/10 border-slate-500/20 text-slate-400'
    }

    return (
        <div
            className={`px-2 py-1 rounded text-[10px] font-medium tracking-wider border ${getSignalStyles(signal)}`}
        >
            {signal}
        </div>
    )
}
