'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { TasksToolbar } from './TasksToolbar'
import { TasksTable } from './TasksTable'
import { JobModal } from './JobModal'
import type { CronJobRow } from '../types'

export function TasksTab() {
    const { data, error, isLoading, mutate } = useSWR<CronJobRow[]>('/api/cron', fetcher, { refreshInterval: 5000 })
    const jobs = data ?? []

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [modalOpen, setModalOpen] = useState(false)
    const [editingJob, setEditingJob] = useState<CronJobRow | null>(null)

    const filtered = jobs.filter((job) => {
        const matchesStatus =
            statusFilter === 'all' ||
            (statusFilter === 'enabled' && job.enabled) ||
            (statusFilter === 'disabled' && !job.enabled)
        if (!matchesStatus) return false

        if (!search) return true
        const q = search.toLowerCase()
        return (
            job.id.toLowerCase().includes(q) ||
            job.name.toLowerCase().includes(q) ||
            job.taskPayload.prompt.toLowerCase().includes(q)
        )
    })

    const handleEdit = (job: CronJobRow) => {
        setEditingJob(job)
        setModalOpen(true)
    }

    const handleNew = () => {
        setEditingJob(null)
        setModalOpen(true)
    }

    const handleDelete = async (job: CronJobRow) => {
        if (!confirm(`Delete "${job.name}"?`)) return
        const res = await fetch(`/api/cron/${job.id}`, { method: 'DELETE' })
        if (!res.ok) return
        mutate()
    }

    const handleRunNow = async (job: CronJobRow) => {
        await fetch(`/api/cron/${job.id}/run`, { method: 'POST' })
        mutate()
    }

    const handleSaved = () => {
        setModalOpen(false)
        setEditingJob(null)
        mutate()
    }

    if (isLoading) {
        return (
            <div className='flex items-center justify-center h-full text-xs text-slate-600'>
                Loading...
            </div>
        )
    }

    if (error) {
        return (
            <div className='flex items-center justify-center h-full text-xs text-red-400'>
                Failed to load cron jobs
            </div>
        )
    }

    return (
        <div className='flex flex-col h-full overflow-hidden'>
            <TasksToolbar
                search={search}
                statusFilter={statusFilter}
                onSearchChange={setSearch}
                onStatusChange={setStatusFilter}
                onNewJob={handleNew}
            />
            <div className='flex-1 overflow-y-auto'>
                <TasksTable
                    jobs={filtered}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onRunNow={handleRunNow}
                />
            </div>
            <JobModal
                open={modalOpen}
                job={editingJob}
                onClose={() => setModalOpen(false)}
                onSaved={handleSaved}
            />
        </div>
    )
}
