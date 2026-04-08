'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { formatDurationMs, formatRelativeTime, statusBadgeClass, type CronJobRunRow } from '../types'

interface RunsTableProps {
    runs: CronJobRunRow[]
}

export function RunsTable({ runs }: RunsTableProps) {
    const [selectedRun, setSelectedRun] = useState<CronJobRunRow | null>(null)

    if (runs.length === 0) {
        return (
            <div className='flex items-center justify-center h-32 text-xs text-slate-600'>
                No execution records yet
            </div>
        )
    }

    return (
        <>
            <div className='overflow-x-auto'>
                <table className='w-full text-xs'>
                    <thead>
                        <tr className='border-b border-white/5 text-slate-500'>
                            <th className='text-left px-4 py-2 font-normal'>Job</th>
                            <th className='text-left px-4 py-2 font-normal'>Status</th>
                            <th className='text-left px-4 py-2 font-normal'>Triggered By</th>
                            <th className='text-left px-4 py-2 font-normal'>Duration</th>
                            <th className='text-left px-4 py-2 font-normal'>Output</th>
                            <th className='text-left px-4 py-2 font-normal'>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {runs.map((run) => (
                            <tr key={run.id} className='border-b border-white/5 hover:bg-white/[0.02]'>
                                <td className='px-4 py-3 text-slate-300'>{run.jobName}</td>
                                <td className='px-4 py-3'>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClass(run.status)}`}>
                                        {run.status}
                                    </span>
                                </td>
                                <td className='px-4 py-3 text-slate-500'>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${run.triggeredBy === 'manual' ? 'bg-blue-500/10 text-blue-400' : 'bg-white/5 text-slate-500'}`}>
                                        {run.triggeredBy}
                                    </span>
                                </td>
                                <td className='px-4 py-3 text-slate-400 font-mono'>{formatDurationMs(run.durationMs)}</td>
                                <td className='px-4 py-3 max-w-[200px]'>
                                    {run.output ? (
                                        <button
                                            type='button'
                                            onClick={() => setSelectedRun(run)}
                                            className='text-slate-500 hover:text-white truncate block max-w-full text-left transition-colors'
                                        >
                                            {run.output.slice(0, 60)}{run.output.length > 60 && '…'}
                                        </button>
                                    ) : (
                                        <span className='text-slate-700'>—</span>
                                    )}
                                </td>
                                <td className='px-4 py-3 text-slate-500'>{formatRelativeTime(run.createdAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Output detail modal */}
            <Dialog.Root open={!!selectedRun} onOpenChange={(o) => !o && setSelectedRun(null)}>
                <Dialog.Portal>
                    <Dialog.Overlay className='fixed inset-0 bg-black/60 backdrop-blur-sm z-40' />
                    <Dialog.Content className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-[#111] border border-white/10 rounded-xl shadow-2xl z-50 p-6'>
                        <div className='flex items-center justify-between mb-4'>
                            <Dialog.Title className='text-sm font-medium text-white'>Run Output</Dialog.Title>
                            <button type='button' onClick={() => setSelectedRun(null)} className='text-slate-500 hover:text-white transition-colors'>
                                <X className='w-4 h-4' />
                            </button>
                        </div>
                        <div className='flex gap-3 mb-4'>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClass(selectedRun?.status ?? '')}`}>
                                {selectedRun?.status}
                            </span>
                            <span className='text-xs text-slate-500'>{selectedRun?.jobName}</span>
                            <span className='text-xs text-slate-600 ml-auto'>{formatDurationMs(selectedRun?.durationMs ?? null)}</span>
                        </div>
                        <pre className='text-xs text-slate-300 bg-black/30 rounded-lg p-4 overflow-y-auto max-h-72 whitespace-pre-wrap break-words'>
                            {selectedRun?.output ?? selectedRun?.error ?? '(no output)'}
                        </pre>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    )
}
