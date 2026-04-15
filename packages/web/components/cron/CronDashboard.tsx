'use client'

import * as Tabs from '@radix-ui/react-tabs'
import { Clock } from 'lucide-react'
import { RunsTab } from './runs/RunsTab'
import { TasksTab } from './tasks/TasksTab'

export function CronDashboard() {
    return (
        <div className='flex flex-col h-full'>
            {/* Header */}
            <div className='h-14 flex items-center px-4 border-b border-white/10 gap-3 shrink-0'>
                <Clock className='w-5 h-5 text-emerald-400' />
                <span className='text-sm font-medium text-white'>Cron</span>
            </div>

            <Tabs.Root
                defaultValue='tasks'
                className='flex flex-col flex-1 overflow-hidden'
            >
                <Tabs.List className='flex border-b border-white/10 px-4 shrink-0 gap-1'>
                    <Tabs.Trigger
                        value='tasks'
                        className='px-4 py-2 text-xs text-slate-400 border-b-2 border-transparent data-[state=active]:border-emerald-400 data-[state=active]:text-white transition-colors'
                    >
                        Tasks
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        value='runs'
                        className='px-4 py-2 text-xs text-slate-400 border-b-2 border-transparent data-[state=active]:border-emerald-400 data-[state=active]:text-white transition-colors'
                    >
                        Runs
                    </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content
                    value='tasks'
                    className='flex-1 overflow-hidden outline-none'
                >
                    <TasksTab />
                </Tabs.Content>
                <Tabs.Content
                    value='runs'
                    className='flex-1 overflow-hidden outline-none'
                >
                    <RunsTab />
                </Tabs.Content>
            </Tabs.Root>
        </div>
    )
}
