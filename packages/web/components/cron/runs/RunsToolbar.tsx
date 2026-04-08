'use client'

import * as Select from '@radix-ui/react-select'
import { ChevronDown, Search } from 'lucide-react'
import type { CronJobRow } from '../types'

interface RunsToolbarProps {
    search: string
    statusFilter: string
    jobFilter: string
    jobs: CronJobRow[]
    onSearchChange: (v: string) => void
    onStatusChange: (v: string) => void
    onJobChange: (v: string) => void
}

export function RunsToolbar({ search, statusFilter, jobFilter, jobs, onSearchChange, onStatusChange, onJobChange }: RunsToolbarProps) {
    return (
        <div className='flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0'>
            <div className='relative flex-1 max-w-xs'>
                <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500' />
                <input
                    type='text'
                    placeholder='Search by job name, id, or output...'
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className='w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50'
                />
            </div>

            <Select.Root value={jobFilter} onValueChange={onJobChange}>
                <Select.Trigger className='flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-white hover:border-white/20 transition-colors focus:outline-none'>
                    <Select.Value placeholder='All Jobs' />
                    <ChevronDown className='w-3 h-3' />
                </Select.Trigger>
                <Select.Portal>
                    <Select.Content className='bg-[#111] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50'>
                        <Select.Viewport className='p-1'>
                            <Select.Item value='all' className='flex items-center px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded cursor-pointer outline-none data-[highlighted]:bg-white/5 data-[highlighted]:text-white'>
                                <Select.ItemText>All Jobs</Select.ItemText>
                            </Select.Item>
                            {jobs.map((job) => (
                                <Select.Item
                                    key={job.id}
                                    value={job.id}
                                    className='flex items-center px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded cursor-pointer outline-none data-[highlighted]:bg-white/5 data-[highlighted]:text-white'
                                >
                                    <Select.ItemText>{job.name}</Select.ItemText>
                                </Select.Item>
                            ))}
                        </Select.Viewport>
                    </Select.Content>
                </Select.Portal>
            </Select.Root>

            <Select.Root value={statusFilter} onValueChange={onStatusChange}>
                <Select.Trigger className='flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-white hover:border-white/20 transition-colors focus:outline-none'>
                    <Select.Value placeholder='All' />
                    <ChevronDown className='w-3 h-3' />
                </Select.Trigger>
                <Select.Portal>
                    <Select.Content className='bg-[#111] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50'>
                        <Select.Viewport className='p-1'>
                            {['All', 'Success', 'Error', 'Timeout'].map((opt) => (
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
        </div>
    )
}
