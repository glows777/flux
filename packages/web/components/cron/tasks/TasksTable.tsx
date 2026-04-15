'use client'

import * as Tooltip from '@radix-ui/react-tooltip'
import { CheckCircle, Pencil, Play, Trash2, XCircle } from 'lucide-react'
import { type CronJobRow, formatRelativeTime, statusBadgeClass } from '../types'

interface TasksTableProps {
    jobs: CronJobRow[]
    onEdit: (job: CronJobRow) => void
    onDelete: (job: CronJobRow) => void
    onRunNow: (job: CronJobRow) => void
}

export function TasksTable({
    jobs,
    onEdit,
    onDelete,
    onRunNow,
}: TasksTableProps) {
    if (jobs.length === 0) {
        return (
            <div className='flex items-center justify-center h-32 text-xs text-slate-600'>
                No cron jobs yet
            </div>
        )
    }

    return (
        <Tooltip.Provider delayDuration={300}>
            <div className='overflow-x-auto'>
                <table className='w-full text-xs'>
                    <thead>
                        <tr className='border-b border-white/5 text-slate-500'>
                            <th className='text-left px-4 py-2 font-normal'>
                                Name
                            </th>
                            <th className='text-left px-4 py-2 font-normal'>
                                Schedule
                            </th>
                            <th className='text-left px-4 py-2 font-normal'>
                                Status
                            </th>
                            <th className='text-left px-4 py-2 font-normal'>
                                Last Run
                            </th>
                            <th className='text-left px-4 py-2 font-normal'>
                                Next Run
                            </th>
                            <th className='text-left px-4 py-2 font-normal'>
                                Retry
                            </th>
                            <th className='px-4 py-2' />
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job) => (
                            <tr
                                key={job.id}
                                className='border-b border-white/5 hover:bg-white/[0.02] group'
                            >
                                {/* Name + prompt preview */}
                                <td className='px-4 py-3 max-w-[200px]'>
                                    <Tooltip.Root>
                                        <Tooltip.Trigger asChild>
                                            <div className='cursor-default'>
                                                <div className='text-white truncate'>
                                                    {job.name}
                                                </div>
                                                <div className='text-slate-600 truncate mt-0.5'>
                                                    {job.taskPayload.prompt}
                                                </div>
                                            </div>
                                        </Tooltip.Trigger>
                                        <Tooltip.Portal>
                                            <Tooltip.Content
                                                className='max-w-xs px-3 py-2 text-xs bg-[#1a1a1a] border border-white/10 rounded-lg text-slate-300 shadow-xl z-50'
                                                sideOffset={4}
                                            >
                                                {job.taskPayload.prompt}
                                                <Tooltip.Arrow className='fill-[#1a1a1a]' />
                                            </Tooltip.Content>
                                        </Tooltip.Portal>
                                    </Tooltip.Root>
                                </td>

                                {/* Schedule */}
                                <td className='px-4 py-3 font-mono text-slate-400'>
                                    {job.schedule}
                                </td>

                                {/* Status badge */}
                                <td className='px-4 py-3'>
                                    <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClass(job.enabled ? 'enabled' : 'disabled')}`}
                                    >
                                        {job.enabled ? 'enabled' : 'disabled'}
                                    </span>
                                </td>

                                {/* Last run */}
                                <td className='px-4 py-3'>
                                    <div className='flex items-center gap-1.5 text-slate-400'>
                                        {job.lastRunStatus === 'success' && (
                                            <CheckCircle className='w-3 h-3 text-emerald-400 shrink-0' />
                                        )}
                                        {job.lastRunStatus === 'error' && (
                                            <XCircle className='w-3 h-3 text-red-400 shrink-0' />
                                        )}
                                        <span>
                                            {formatRelativeTime(job.lastRunAt)}
                                        </span>
                                    </div>
                                </td>

                                {/* Next run */}
                                <td className='px-4 py-3 text-slate-400'>
                                    {job.enabled
                                        ? formatRelativeTime(job.nextRunAt)
                                        : '—'}
                                </td>

                                {/* Retry count */}
                                <td className='px-4 py-3'>
                                    {job.retryCount > 0 && (
                                        <span className='text-amber-400'>
                                            {job.retryCount}
                                        </span>
                                    )}
                                </td>

                                {/* Actions */}
                                <td className='px-4 py-3'>
                                    <div className='flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                                        <button
                                            type='button'
                                            onClick={() => onRunNow(job)}
                                            className='text-slate-500 hover:text-emerald-400 transition-colors'
                                            title='Run now'
                                        >
                                            <Play className='w-3.5 h-3.5' />
                                        </button>
                                        <button
                                            type='button'
                                            onClick={() => onEdit(job)}
                                            className='text-slate-500 hover:text-white transition-colors'
                                            title='Edit'
                                        >
                                            <Pencil className='w-3.5 h-3.5' />
                                        </button>
                                        <button
                                            type='button'
                                            onClick={() => onDelete(job)}
                                            className='text-slate-500 hover:text-red-400 transition-colors'
                                            title='Delete'
                                        >
                                            <Trash2 className='w-3.5 h-3.5' />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Tooltip.Provider>
    )
}
