import { describe, it, expect } from 'bun:test'
import { formatRelativeTime, groupDocuments } from '@/components/dev/DocTree'

describe('formatRelativeTime', () => {
    it('returns "just now" for < 1 minute', () => {
        const now = new Date().toISOString()
        expect(formatRelativeTime(now)).toBe('just now')
    })

    it('returns "Xm ago" for minutes', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString()
        expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago')
    })

    it('returns "Xh ago" for hours', () => {
        const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString()
        expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago')
    })

    it('returns "Xd ago" for days', () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString()
        expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago')
    })

    it('returns "Xw ago" for >= 7 days', () => {
        const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()
        expect(formatRelativeTime(twoWeeksAgo)).toBe('2w ago')
    })
})

describe('groupDocuments', () => {
    it('groups root-level docs under "常驻文档"', () => {
        const docs = [
            { id: '1', path: 'profile.md', evergreen: true, updatedAt: new Date().toISOString() },
            { id: '2', path: 'portfolio.md', evergreen: true, updatedAt: new Date().toISOString() },
        ]
        const groups = groupDocuments(docs)
        expect(groups).toHaveLength(1)
        expect(groups[0].label).toBe('常驻文档')
        expect(groups[0].docs).toHaveLength(2)
    })

    it('groups nested docs by directory prefix', () => {
        const docs = [
            { id: '1', path: 'profile.md', evergreen: true, updatedAt: new Date().toISOString() },
            { id: '2', path: 'opinions/AAPL.md', evergreen: false, updatedAt: new Date().toISOString() },
            { id: '3', path: 'opinions/NVDA.md', evergreen: false, updatedAt: new Date().toISOString() },
            { id: '4', path: 'log/2026-03-10.md', evergreen: false, updatedAt: new Date().toISOString() },
        ]
        const groups = groupDocuments(docs)
        expect(groups).toHaveLength(3)
        expect(groups[1].label).toBe('opinions/')
        expect(groups[1].docs).toHaveLength(2)
    })

    it('returns empty array for no docs', () => {
        expect(groupDocuments([])).toEqual([])
    })
})
