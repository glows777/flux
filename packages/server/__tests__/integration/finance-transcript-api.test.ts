/**
 * Phase 3: PUT /api/stocks/:symbol/earnings/transcript Integration Tests
 *
 * Test scenarios:
 * - Normal upload: returns 200 with SaveTranscriptResult
 * - Auto-uppercases symbol
 * - Passes correct arguments to saveTranscript
 * - Validation: missing year → 400
 * - Validation: missing quarter → 400
 * - Validation: missing content → 400
 * - Validation: missing reportDate → 400
 * - Validation: content too short (<100 chars) → 400
 * - Validation: invalid year/quarter → 400
 * - Validation: invalid reportDate format → 400
 * - Validation: invalid symbol → 400
 * - Service error → 500
 * - Malformed JSON body → 400
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import './setup'
import { mockSaveTranscript } from './helpers/mock-boundaries'

import { createHonoApp } from '@/routes/index'

// ==================== Test app ====================

const app = createHonoApp()

function putTranscript(symbol: string, body?: Record<string, unknown> | string) {
    return app.request(`/api/stocks/${symbol}/earnings/transcript`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
    })
}

// Content must be >= 100 chars
const VALID_CONTENT = 'A'.repeat(150)

const VALID_BODY = {
    year: 2024,
    quarter: 3,
    content: VALID_CONTENT,
    reportDate: '2024-09-28',
}

// ==================== Tests ====================

describe('PUT /api/stocks/:symbol/earnings/transcript', () => {
    beforeEach(() => {
        mockSaveTranscript.mockReset()
        mockSaveTranscript.mockImplementation(async () => ({
            symbol: 'AAPL',
            quarter: '2024-Q3',
        }))
    })

    // ─── Normal response ───

    describe('Normal response', () => {
        it('returns 200 with SaveTranscriptResult', async () => {
            const res = await putTranscript('AAPL', VALID_BODY)

            expect(res.status).toBe(200)
            const json = await res.json()
            expect(json.success).toBe(true)
            expect(json.data.symbol).toBe('AAPL')
            expect(json.data.quarter).toBe('2024-Q3')
        })

        it('auto-uppercases symbol', async () => {
            await putTranscript('aapl', VALID_BODY)

            expect(mockSaveTranscript).toHaveBeenCalled()
            const call = mockSaveTranscript.mock.calls[0]
            expect(call[0]).toBe('AAPL')
        })

        it('passes correct arguments to saveTranscript', async () => {
            await putTranscript('AAPL', VALID_BODY)

            const call = mockSaveTranscript.mock.calls[0]
            expect(call[0]).toBe('AAPL')
            expect(call[1]).toBe(2024)
            expect(call[2]).toBe(3)
            expect(call[3]).toBe(VALID_CONTENT)
            expect(call[4]).toEqual(new Date('2024-09-28'))
        })
    })

    // ─── Validation errors ───

    describe('Validation errors', () => {
        it('returns 400 when year is missing', async () => {
            const res = await putTranscript('AAPL', {
                quarter: 3,
                content: VALID_CONTENT,
                reportDate: '2024-09-28',
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 when quarter is missing', async () => {
            const res = await putTranscript('AAPL', {
                year: 2024,
                content: VALID_CONTENT,
                reportDate: '2024-09-28',
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 when content is missing', async () => {
            const res = await putTranscript('AAPL', {
                year: 2024,
                quarter: 3,
                reportDate: '2024-09-28',
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 when reportDate is missing', async () => {
            const res = await putTranscript('AAPL', {
                year: 2024,
                quarter: 3,
                content: VALID_CONTENT,
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 when content is too short (<100 chars)', async () => {
            const res = await putTranscript('AAPL', {
                ...VALID_BODY,
                content: 'too short',
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for invalid year', async () => {
            const res = await putTranscript('AAPL', {
                ...VALID_BODY,
                year: 1800,
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for invalid quarter (0)', async () => {
            const res = await putTranscript('AAPL', {
                ...VALID_BODY,
                quarter: 0,
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for invalid quarter (5)', async () => {
            const res = await putTranscript('AAPL', {
                ...VALID_BODY,
                quarter: 5,
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for invalid reportDate format', async () => {
            const res = await putTranscript('AAPL', {
                ...VALID_BODY,
                reportDate: '09-28-2024',
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })

        it('returns 400 for invalid symbol format', async () => {
            const res = await putTranscript('invalid!!!', VALID_BODY)

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })
    })

    // ─── Service error ───

    describe('Service errors', () => {
        it('returns 500 when saveTranscript throws', async () => {
            mockSaveTranscript.mockImplementation(() =>
                Promise.reject(new Error('DB connection failed')),
            )

            const res = await putTranscript('AAPL', VALID_BODY)

            expect(res.status).toBe(500)
            const json = await res.json()
            expect(json.success).toBe(false)
            expect(json.error).toBe('Failed to save transcript')
        })
    })

    // ─── Malformed JSON ───

    describe('Malformed JSON', () => {
        it('returns 400 for malformed JSON body', async () => {
            const res = await app.request('/api/stocks/AAPL/earnings/transcript', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: '{invalid json',
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.success).toBe(false)
        })
    })
})
