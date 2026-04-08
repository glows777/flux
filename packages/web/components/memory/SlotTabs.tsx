'use client'

// ─── Types ───

export interface SlotEntry {
    readonly slot: string
    readonly content: string | null
    readonly limit: number
    readonly history: readonly {
        readonly id: string
        readonly author: string
        readonly reason: string | null
        readonly createdAt: string
        readonly content: string
    }[]
}

interface SlotTabsProps {
    readonly slots: readonly SlotEntry[]
    readonly activeSlot: string
    readonly onSelect: (slot: string) => void
}

// ─── Pure helpers (exported for testing) ───

export function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'just now'
    const hours = Math.floor(minutes / 60)
    if (hours < 1) return `${minutes}m ago`
    const days = Math.floor(hours / 24)
    if (days < 1) return `${hours}h ago`
    const weeks = Math.floor(days / 7)
    if (weeks < 1) return `${days}d ago`
    return `${weeks}w ago`
}

export function formatSlotName(slot: string): string {
    return slot
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
}

// ─── Component ───

export function SlotTabs({ slots, activeSlot, onSelect }: SlotTabsProps) {
    return (
        <div className='flex flex-col h-full py-2'>
            {slots.map((entry) => {
                const isActive = entry.slot === activeSlot
                const latestVersion = entry.history[0]
                const lastUpdated = latestVersion
                    ? formatRelativeTime(latestVersion.createdAt)
                    : null

                return (
                    <button
                        key={entry.slot}
                        type='button'
                        onClick={() => onSelect(entry.slot)}
                        className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                            isActive
                                ? 'border-emerald-400 bg-emerald-500/10 text-white'
                                : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <div className='text-xs font-medium truncate'>
                            {formatSlotName(entry.slot)}
                        </div>
                        <div className='text-[10px] mt-0.5 text-slate-600'>
                            {lastUpdated ?? '暂无记录'}
                        </div>
                    </button>
                )
            })}
        </div>
    )
}
