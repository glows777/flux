import { describe, expect, it } from 'bun:test'

const { formatDurationMs, formatRelativeTime, statusBadgeClass } = await import('@/components/cron/types')

describe('formatDurationMs', () => {
    it('formats sub-second as ms', () => {
        expect(formatDurationMs(450)).toBe('450ms')
    })

    it('formats seconds with one decimal', () => {
        expect(formatDurationMs(1200)).toBe('1.2s')
    })

    it('formats minutes', () => {
        expect(formatDurationMs(90000)).toBe('1m 30s')
    })

    it('returns dash for null', () => {
        expect(formatDurationMs(null)).toBe('—')
    })
})

describe('formatRelativeTime', () => {
    it('returns "just now" for recent timestamps', () => {
        const recent = new Date(Date.now() - 30000).toISOString()
        expect(formatRelativeTime(recent)).toBe('just now')
    })

    it('returns minutes ago', () => {
        // Subtract extra 500ms buffer so diff reliably floors to 5m
        const past = new Date(Date.now() - 5 * 60 * 1000 - 500).toISOString()
        expect(formatRelativeTime(past)).toBe('5m ago')
    })

    it('returns dash for null', () => {
        expect(formatRelativeTime(null)).toBe('—')
    })

    it('returns "in Xm" for future timestamps', () => {
        const future = new Date(Date.now() + 10 * 60 * 1000).toISOString()
        expect(formatRelativeTime(future)).toBe('in 10m')
    })

    it('returns "in Xh" for future timestamps hours away', () => {
        const future = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
        expect(formatRelativeTime(future)).toBe('in 3h')
    })
})

describe('statusBadgeClass', () => {
    it('returns emerald for success', () => {
        expect(statusBadgeClass('success')).toContain('emerald')
    })

    it('returns red for error', () => {
        expect(statusBadgeClass('error')).toContain('red')
    })

    it('returns amber for timeout', () => {
        expect(statusBadgeClass('timeout')).toContain('amber')
    })
})
