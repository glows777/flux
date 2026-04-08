// ─── Types ───

export interface CronJobRow {
    id: string
    name: string
    schedule: string
    taskType: string
    taskPayload: { prompt: string }
    enabled: boolean
    lastRunAt: string | null
    lastRunStatus: 'success' | 'error' | 'timeout' | null
    lastRunError: string | null
    retryCount: number
    createdAt: string
    nextRunAt: string | null
    channelTarget?: { type: string; channelId: string }
}

export interface CronJobRunRow {
    id: string
    jobId: string
    jobName: string
    status: 'success' | 'error' | 'timeout'
    output: string | null
    error: string | null
    durationMs: number | null
    triggeredBy: 'scheduler' | 'manual'
    createdAt: string
}

// ─── Pure helpers ───

export function formatDurationMs(ms: number | null | undefined): string {
    if (ms == null) return '—'
    if (ms < 1000) return `${ms}ms`
    const s = ms / 1000
    if (s < 60) return `${s.toFixed(1)}s`
    const m = Math.floor(s / 60)
    const rem = Math.floor(s % 60)
    return `${m}m ${rem}s`
}

export function formatRelativeTime(dateStr: string | null | undefined): string {
    if (!dateStr) return '—'
    const diff = Date.now() - new Date(dateStr).getTime()
    if (diff < 0) {
        const abs = -diff
        const minutes = Math.floor(abs / 60000)
        if (minutes < 1) return 'in <1m'
        const hours = Math.floor(minutes / 60)
        if (hours < 1) return `in ${minutes}m`
        const days = Math.floor(hours / 24)
        if (days < 1) return `in ${hours}h`
        return `in ${days}d`
    }
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'just now'
    const hours = Math.floor(minutes / 60)
    if (hours < 1) return `${minutes}m ago`
    const days = Math.floor(hours / 24)
    if (days < 1) return `${hours}h ago`
    return `${days}d ago`
}

export function statusBadgeClass(status: string): string {
    switch (status) {
        case 'success':
        case 'enabled':
            return 'text-emerald-400 bg-emerald-500/10'
        case 'error':
            return 'text-red-400 bg-red-500/10'
        case 'timeout':
        case 'disabled':
            return 'text-amber-400 bg-amber-500/10'
        default:
            return 'text-slate-400 bg-slate-500/10'
    }
}
