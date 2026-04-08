'use client'

import * as Select from '@radix-ui/react-select'
import { ChevronDown, Plus, Search } from 'lucide-react'

interface TasksToolbarProps {
    search: string
    statusFilter: string
    onSearchChange: (v: string) => void
    onStatusChange: (v: string) => void
    onNewJob: () => void
}

export function TasksToolbar({ search, statusFilter, onSearchChange, onStatusChange, onNewJob }: TasksToolbarProps) {
    return (
        <div className='flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0'>
            <div className='relative flex-1 max-w-xs'>
                <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500' />
                <input
                    type='text'
                    placeholder='Search by name, id, or prompt...'
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className='w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50'
                />
            </div>

            <Select.Root value={statusFilter} onValueChange={onStatusChange}>
                <Select.Trigger className='flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-white hover:border-white/20 transition-colors focus:outline-none'>
                    <Select.Value placeholder='All' />
                    <ChevronDown className='w-3 h-3' />
                </Select.Trigger>
                <Select.Portal>
                    <Select.Content className='bg-[#111] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50'>
                        <Select.Viewport className='p-1'>
                            {['All', 'Enabled', 'Disabled'].map((opt) => (
                                <Select.Item
                                    key={opt}
                                    value={opt.toLowerCase()}
                                    className='flex items-center px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded cursor-pointer outline-none data-[highlighted]:bg-white/5 data-[highlighted]:text-white'
                                >
                                    <Select.ItemText>{opt}</Select.ItemText>
                                </Select.Item>
                            ))}
                        </Select.Viewport>
                    </Select.Content>
                </Select.Portal>
            </Select.Root>

            <button
                type='button'
                onClick={onNewJob}
                className='flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors ml-auto'
            >
                <Plus className='w-3.5 h-3.5' />
                New Job
            </button>
        </div>
    )
}
