interface StatCardProps {
    label: string
    value: string
    sub: string
    subColor?: 'emerald' | 'rose' | 'slate'
    sub2?: string
    sub2Color?: 'emerald' | 'rose' | 'slate'
    active?: boolean
    action?: {
        label: string
        onClick: () => void
    }
}

export function StatCard({ label, value, sub, subColor = 'emerald', sub2, sub2Color = 'slate', active = false, action }: StatCardProps) {
    const subColorClasses = {
        emerald: 'text-emerald-400/80',
        rose: 'text-rose-400/80',
        slate: 'text-slate-500',
    }

    return (
        <div
            className={`p-6 rounded-2xl border transition-all duration-300 cursor-pointer group hover:-translate-y-1
        ${
            active
                ? 'bg-gradient-to-br from-white/[0.08] to-transparent border-white/10 shadow-[0_0_30px_rgba(255,255,255,0.05)]'
                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
        }`}
        >
            <div className='flex items-center justify-between mb-2'>
                <div className='text-slate-500 text-xs uppercase tracking-widest'>
                    {label}
                </div>
                {action && (
                    <button
                        type='button'
                        onClick={(e) => {
                            e.stopPropagation()
                            action.onClick()
                        }}
                        className='text-[10px] text-slate-500 hover:text-emerald-400 transition-colors'
                    >
                        {action.label}
                    </button>
                )}
            </div>
            <div className='text-3xl font-light text-white mb-1'>{value}</div>
            <div className='flex items-center gap-2'>
                {active && (
                    <div className='w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse' />
                )}
                <div className={`text-xs font-medium ${subColorClasses[subColor]}`}>
                    {sub}
                </div>
            </div>
            {sub2 && (
                <div className={`text-xs font-medium ${subColorClasses[sub2Color]}`}>
                    {sub2}
                </div>
            )}
        </div>
    )
}
