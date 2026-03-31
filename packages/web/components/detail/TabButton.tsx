import { LucideIcon } from 'lucide-react'

interface TabButtonProps {
    icon: LucideIcon
    label: string
    active: boolean
    onClick: () => void
}

export function TabButton({
    icon: Icon,
    label,
    active,
    onClick,
}: TabButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 py-4 flex items-center justify-center gap-2 text-xs font-medium transition-all relative
        ${active ? 'text-emerald-400 bg-white/[0.02]' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.01]'}`}
        >
            <Icon
                size={14}
                className={active ? 'text-emerald-400' : 'text-slate-600'}
            />
            {label}
            {active && (
                <div className='absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]'></div>
            )}
        </button>
    )
}
