/**
 * Phase 3: Transcript Service Unit Tests
 *
 * Test scenarios:
 * - saveTranscript: upserts with type="TRANSCRIPT"
 * - saveTranscript: deletes stale L2 cache after saving
 * - saveTranscript: returns SaveTranscriptResult with symbol and quarter key
 * - saveTranscript: handles L2 delete no-op gracefully
 * - saveTranscript: propagates upsert errors
 * - saveTranscript: propagates deleteCache errors
 * - getUploadedTranscript: returns content when found
 * - getUploadedTranscript: returns null when not found
 * - getUploadedTranscript: returns content even when old (user uploads never expire)
 * - getUploadedTranscript: calls findCache with correct quarter key and type
 * - getUploadedTranscript: propagates findCache errors
 */

import { describe, expect, it, mock } from 'bun:test'
import type { TranscriptServiceDeps } from '@/core/finance/transcript-service'
import { getUploadedTranscript, saveTranscript } from '@/core/finance/transcript-service'

// ─── Mock deps factory ───

function createMockDeps(overrides?: Partial<TranscriptServiceDeps>): TranscriptServiceDeps {
    return {
        findCache: mock(() => Promise.resolve(null)),
        upsertCache: mock(() => Promise.resolve()),
        deleteCache: mock(() => Promise.resolve()),
        ...overrides,
    }
}

// ─── saveTranscript ───

describe('saveTranscript', () => {
    it('upserts with type TRANSCRIPT and correct quarter key', async () => {
        const deps = createMockDeps()
        await saveTranscript('AAPL', 2024, 3, 'transcript content here', new Date('2024-09-28'), deps)

        expect(deps.upsertCache).toHaveBeenCalledWith({
            symbol: 'AAPL',
            quarter: '2024-Q3',
            type: 'TRANSCRIPT',
            content: 'transcript content here',
            reportDate: new Date('2024-09-28'),
        })
    })

    it('deletes stale L2 cache after saving', async () => {
        const deps = createMockDeps()
        await saveTranscript('AAPL', 2024, 3, 'content', new Date('2024-09-28'), deps)

        expect(deps.deleteCache).toHaveBeenCalledWith('AAPL', '2024-Q3', 'L2')
    })

    it('returns SaveTranscriptResult with symbol and quarter key', async () => {
        const deps = createMockDeps()
        const result = await saveTranscript('AAPL', 2024, 3, 'content', new Date('2024-09-28'), deps)

        expect(result).toEqual({ symbol: 'AAPL', quarter: '2024-Q3' })
    })

    it('handles L2 delete no-op gracefully (no existing L2 cache)', async () => {
        const mockDelete = mock(() => Promise.resolve())
        const deps = createMockDeps({ deleteCache: mockDelete })
        const result = await saveTranscript('AAPL', 2024, 3, 'content', new Date('2024-09-28'), deps)

        expect(result.symbol).toBe('AAPL')
        expect(mockDelete).toHaveBeenCalledTimes(1)
    })

    it('propagates upsert errors', async () => {
        const deps = createMockDeps({
            upsertCache: mock(() => Promise.reject(new Error('DB write failed'))),
        })

        try {
            await saveTranscript('AAPL', 2024, 3, 'content', new Date('2024-09-28'), deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toBe('DB write failed')
        }
    })

    it('propagates deleteCache errors', async () => {
        const deps = createMockDeps({
            deleteCache: mock(() => Promise.reject(new Error('DB delete failed'))),
        })

        try {
            await saveTranscript('AAPL', 2024, 3, 'content', new Date('2024-09-28'), deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toBe('DB delete failed')
        }
    })
})

// ─── getUploadedTranscript ───

describe('getUploadedTranscript', () => {
    it('returns content when found', async () => {
        const recentDate = new Date()
        recentDate.setDate(recentDate.getDate() - 10) // 10 days ago

        const deps = createMockDeps({
            findCache: mock(() =>
                Promise.resolve({
                    content: 'uploaded transcript text',
                    reportDate: recentDate,
                    createdAt: recentDate,
                }),
            ),
        })

        const result = await getUploadedTranscript('AAPL', 2024, 3, deps)
        expect(result).toBe('uploaded transcript text')
    })

    it('returns null when not found', async () => {
        const deps = createMockDeps({
            findCache: mock(() => Promise.resolve(null)),
        })

        const result = await getUploadedTranscript('AAPL', 2024, 3, deps)
        expect(result).toBeNull()
    })

    it('returns content even when old (user uploads never expire)', async () => {
        const expiredDate = new Date()
        expiredDate.setDate(expiredDate.getDate() - 101) // 101 days ago

        const deps = createMockDeps({
            findCache: mock(() =>
                Promise.resolve({
                    content: 'old transcript',
                    reportDate: expiredDate,
                    createdAt: expiredDate,
                }),
            ),
        })

        const result = await getUploadedTranscript('AAPL', 2024, 3, deps)
        expect(result).toBe('old transcript')
    })

    it('calls findCache with correct quarter key and type', async () => {
        const mockFind = mock(() => Promise.resolve(null))
        const deps = createMockDeps({ findCache: mockFind })

        await getUploadedTranscript('AAPL', 2024, 3, deps)

        expect(mockFind).toHaveBeenCalledWith('AAPL', '2024-Q3', 'TRANSCRIPT')
    })

    it('propagates findCache errors', async () => {
        const deps = createMockDeps({
            findCache: mock(() => Promise.reject(new Error('DB read failed'))),
        })

        try {
            await getUploadedTranscript('AAPL', 2024, 3, deps)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toBe('DB read failed')
        }
    })
})
