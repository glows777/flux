'use client'

import type { LucideIcon } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'

interface NavIconProps {
    icon: LucideIcon
    active?: boolean
    disabled?: boolean
    onClick?: () => void
}

export function NavIcon({
    icon: Icon,
    active,
    disabled,
    onClick,
}: NavIconProps) {
    const handleClick = () => {
        if (disabled) {
            showToast('即将开放')
            return
        }
        onClick?.()
    }

    return (
        <div
            onClick={handleClick}
            className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 group
        ${active ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
        >
            <Icon
                size={18}
                className='group-hover:scale-110 transition-transform'
            />
        </div>
    )
}
