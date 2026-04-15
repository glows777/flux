'use client'

import {
    BarChart2,
    Bell,
    Brain,
    Globe,
    Home,
    Layers,
    MessageSquare,
    Settings,
} from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { Logo } from './Logo'
import { NavIcon } from './NavIcon'

export function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()

    return (
        <aside
            className='w-16 md:w-20 border-r border-white/5 flex flex-col items-center justify-between z-20 backdrop-blur-xl bg-black/20'
            style={{ paddingTop: 32, paddingBottom: 32 }}
        >
            <div className='flex flex-col items-center gap-8'>
                <Logo />
                <nav className='flex flex-col items-center gap-6 w-full px-2'>
                    <NavIcon
                        icon={Home}
                        active={pathname === '/'}
                        onClick={() => router.push('/')}
                    />
                    <NavIcon
                        icon={MessageSquare}
                        active={pathname.startsWith('/chat')}
                        onClick={() => router.push('/chat')}
                    />
                    <NavIcon
                        icon={Brain}
                        active={pathname === '/memory'}
                        onClick={() => router.push('/memory')}
                    />
                    <NavIcon icon={BarChart2} disabled />
                    <NavIcon icon={Globe} disabled />
                    <NavIcon
                        icon={Layers}
                        active={pathname === '/cron'}
                        onClick={() => router.push('/cron')}
                    />
                </nav>
            </div>

            <div className='flex flex-col items-center gap-6'>
                <NavIcon icon={Bell} disabled />
                <NavIcon icon={Settings} disabled />
                <div className='w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-medium text-slate-400'>
                    JD
                </div>
            </div>
        </aside>
    )
}
