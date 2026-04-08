'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import * as Switch from '@radix-ui/react-switch'
import { X, ChevronDown } from 'lucide-react'
import type { CronJobRow } from '../types'

interface JobModalProps {
    open: boolean
    job: CronJobRow | null   // null = create mode
    onClose: () => void
    onSaved: () => void
}

const TASK_TYPES = ['trading-agent', 'auto-trading-agent']

export function JobModal({ open, job, onClose, onSaved }: JobModalProps) {
    const [name, setName] = useState('')
    const [schedule, setSchedule] = useState('')
    const [taskType, setTaskType] = useState('trading-agent')
    const [prompt, setPrompt] = useState('')
    const [channelId, setChannelId] = useState('')
    const [enabled, setEnabled] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (job) {
            setName(job.name)
            setSchedule(job.schedule)
            setTaskType(job.taskType)
            setPrompt(job.taskPayload.prompt)
            setChannelId((job as any).channelTarget?.channelId ?? '')
            setEnabled(job.enabled)
        } else {
            setName('')
            setSchedule('')
            setTaskType('trading-agent')
            setPrompt('')
            setChannelId('')
            setEnabled(true)
        }
        setError(null)
    }, [job, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setError(null)

        const body = {
            name,
            schedule,
            taskType,
            taskPayload: { prompt },
            ...(channelId ? { channelTarget: { type: 'discord', channelId } } : {}),
            ...(job ? { enabled } : {}),
        }

        try {
            const url = job ? `/api/cron/${job.id}` : '/api/cron'
            const method = job ? 'PUT' : 'POST'
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const json = await res.json()
            if (!json.success) throw new Error(json.error ?? 'Failed to save')
            onSaved()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className='fixed inset-0 bg-black/60 backdrop-blur-sm z-40' />
                <Dialog.Content className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[#111] border border-white/10 rounded-xl shadow-2xl z-50 p-6'>
                    <div className='flex items-center justify-between mb-5'>
                        <Dialog.Title className='text-sm font-medium text-white'>
                            {job ? 'Edit Job' : 'New Cron Job'}
                        </Dialog.Title>
                        <button type='button' onClick={onClose} className='text-slate-500 hover:text-white transition-colors'>
                            <X className='w-4 h-4' />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
                        {/* Name */}
                        <div className='flex flex-col gap-1.5'>
                            <label className='text-xs text-slate-400'>Name</label>
                            <input
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className='px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50'
                                placeholder='e.g. morning-brief'
                            />
                        </div>

                        {/* Schedule */}
                        <div className='flex flex-col gap-1.5'>
                            <label className='text-xs text-slate-400'>Schedule</label>
                            <input
                                required
                                value={schedule}
                                onChange={(e) => setSchedule(e.target.value)}
                                className='px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 font-mono'
                                placeholder='every:30m  or  0 9 * * 1-5'
                            />
                            <span className='text-[10px] text-slate-600'>Use <code>every:5m</code>, <code>every:2h</code>, or a standard cron expression. Min interval: 60s.</span>
                        </div>

                        {/* Task Type */}
                        <div className='flex flex-col gap-1.5'>
                            <label className='text-xs text-slate-400'>Task Type</label>
                            <Select.Root value={taskType} onValueChange={setTaskType}>
                                <Select.Trigger className='flex items-center justify-between px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-emerald-500/50'>
                                    <Select.Value />
                                    <ChevronDown className='w-3 h-3 text-slate-400' />
                                </Select.Trigger>
                                <Select.Portal>
                                    <Select.Content className='bg-[#111] border border-white/10 rounded-lg shadow-xl z-[60] overflow-hidden'>
                                        <Select.Viewport className='p-1'>
                                            {TASK_TYPES.map((t) => (
                                                <Select.Item
                                                    key={t}
                                                    value={t}
                                                    className='px-3 py-1.5 text-xs text-slate-400 cursor-pointer rounded outline-none data-[highlighted]:bg-white/5 data-[highlighted]:text-white'
                                                >
                                                    <Select.ItemText>{t}</Select.ItemText>
                                                </Select.Item>
                                            ))}
                                        </Select.Viewport>
                                    </Select.Content>
                                </Select.Portal>
                            </Select.Root>
                        </div>

                        {/* Prompt */}
                        <div className='flex flex-col gap-1.5'>
                            <label className='text-xs text-slate-400'>Prompt</label>
                            <textarea
                                required
                                rows={3}
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className='px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 resize-none'
                                placeholder='What should the agent do?'
                            />
                        </div>

                        {/* Channel ID (optional) */}
                        <div className='flex flex-col gap-1.5'>
                            <label className='text-xs text-slate-400'>Discord Channel ID <span className='text-slate-600'>(optional)</span></label>
                            <input
                                value={channelId}
                                onChange={(e) => setChannelId(e.target.value)}
                                className='px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 font-mono'
                                placeholder='123456789012345678'
                            />
                        </div>

                        {/* Enabled toggle (edit mode only) */}
                        {job && (
                            <div className='flex items-center justify-between'>
                                <label className='text-xs text-slate-400'>Enabled</label>
                                <Switch.Root
                                    checked={enabled}
                                    onCheckedChange={setEnabled}
                                    className='w-9 h-5 bg-slate-700 rounded-full relative data-[state=checked]:bg-emerald-500 transition-colors focus:outline-none'
                                >
                                    <Switch.Thumb className='block w-4 h-4 bg-white rounded-full shadow translate-x-0.5 transition-transform data-[state=checked]:translate-x-[18px]' />
                                </Switch.Root>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <p className='text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg'>{error}</p>
                        )}

                        {/* Actions */}
                        <div className='flex justify-end gap-2 pt-1'>
                            <button
                                type='button'
                                onClick={onClose}
                                className='px-4 py-1.5 text-xs text-slate-400 hover:text-white transition-colors'
                            >
                                Cancel
                            </button>
                            <button
                                type='submit'
                                disabled={saving}
                                className='px-4 py-1.5 text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors disabled:opacity-50'
                            >
                                {saving ? 'Saving...' : job ? 'Save Changes' : 'Create Job'}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
