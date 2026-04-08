'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { RunsToolbar } from './RunsToolbar'
import { RunsTable } from './RunsTable'
import type { CronJobRow, CronJobRunRow } from '../types'

export function RunsTab() {
    const { data: runs, error: runsError, isLoading: runsLoading } = useSWR<CronJobRunRow[]>('/api/cron/runs?limit=50', fetcher, { refreshInterval: 5000 })
    const { data: jobs } = useSWR<CronJobRow[]>('/api/cron', fetcher, { refreshInterval: 5000 })

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [jobFilter, setJobFilter] = useState('all')

    const allRuns = runs ?? []
    const allJobs = jobs ?? []

    const filtered = allRuns.filter((run) => {
        if (statusFilter !== 'all' && run.status !== statusFilter) return false
        if (jobFilter !== 'all' && run.jobId !== jobFilter) return false
        if (!search) return true
        const q = search.toLowerCase()
        return (
            run.id.toLowerCase().includes(q) ||
            run.jobName.toLowerCase().includes(q) ||
            (run.output ?? '').toLowerCase().includes(q)
        )
    })

    if (runsLoading) {
        return (
            <div className='flex items-center justify-center h-full text-xs text-slate-600'>
                Loading...
            </div>
        )
    }

    if (runsError) {
        return (
            <div className='flex items-center justify-center h-full text-xs text-red-400'>
                Failed to load run history
            </div>
        )
    }

    return (
        <div className='flex flex-col h-full overflow-hidden'>
            <RunsToolbar
                search={search}
                statusFilter={statusFilter}
                jobFilter={jobFilter}
                jobs={allJobs}
                onSearchChange={setSearch}
                onStatusChange={setStatusFilter}
                onJobChange={setJobFilter}
            />
            <div className='flex-1 overflow-y-auto'>
                <RunsTable runs={filtered} />
            </div>
        </div>
    )
}
