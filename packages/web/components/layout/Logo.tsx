'use client'

import Link from 'next/link'

export function Logo() {
    return (
        <Link
            href='/'
            className='w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-transparent border border-white/10 flex items-center justify-center cursor-pointer group hover:border-emerald-500/50 transition-colors'
        >
            <div className='w-4 h-4 bg-emerald-400 rotate-45 rounded-sm group-hover:rotate-90 transition-transform duration-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]' />
        </Link>
    )
}
