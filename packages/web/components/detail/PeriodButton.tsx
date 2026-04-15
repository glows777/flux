'use client'

interface PeriodButtonProps {
    label: string // '1日' | '1周' | '1月' | '3月' | '今年'
    active?: boolean
    onClick?: () => void
}

/**
 * 时间周期切换按钮
 * 用于图表时间段选择
 */
export function PeriodButton({
    label,
    active = false,
    onClick,
}: PeriodButtonProps) {
    return (
        <button
            type='button'
            onClick={onClick}
            className={`
        px-3 py-1 rounded-full text-xs transition-all
        ${
            active
                ? 'bg-white text-black font-medium'
                : 'text-slate-500 border border-white/10 hover:border-white/20 hover:bg-white/5'
        }
      `}
        >
            {label}
        </button>
    )
}
