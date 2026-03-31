interface MetricCardProps {
    label: string // 如 "市盈率 (PE)"
    value: string // 如 "60.5x"
}

/**
 * 财务指标卡片
 * 显示单个财务指标的标签和数值
 */
export function MetricCard({ label, value }: MetricCardProps) {
    return (
        <div className='p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors'>
            <div className='text-[10px] text-slate-500 uppercase tracking-widest mb-2'>
                {label}
            </div>
            <div className='text-white font-medium text-lg'>{value}</div>
        </div>
    )
}
