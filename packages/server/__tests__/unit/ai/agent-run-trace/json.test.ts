import { describe, expect, test } from 'bun:test'
import {
    hashTraceValue,
    measureTraceJsonBytes,
    sanitizeTraceJson,
    stableTraceStringify,
    truncateTraceText,
} from '@/core/ai/agent-run-trace/json'

describe('trace JSON hygiene', () => {
    test('serializes non-json values without throwing', () => {
        const cyclic: Record<string, unknown> = {
            count: 1n,
            skipped: undefined,
            fn: () => 'hidden',
            error: Object.assign(new Error('boom'), { code: 'E_BOOM' }),
        }
        cyclic.self = cyclic

        const result = sanitizeTraceJson(cyclic, {
            maxBytes: 10_000,
            maxDepth: 8,
            maxArrayItems: 50,
            maxStringBytes: 10_000,
            redactKeys: [],
        })

        expect(result.notes).toContain('circular_reference')
        expect(result.value).toMatchObject({
            count: '1',
            skipped: '[Undefined]',
            fn: '[Function]',
            error: {
                name: 'Error',
                message: 'boom',
                code: 'E_BOOM',
            },
            self: '[Circular]',
        })
    })

    test('serializes shared object references without marking them circular', () => {
        const shared = { id: 'shared', count: 2 }

        const result = sanitizeTraceJson(
            { a: shared, b: shared },
            {
                maxBytes: 10_000,
                maxDepth: 8,
                maxArrayItems: 50,
                maxStringBytes: 10_000,
                redactKeys: [],
            },
        )

        expect(result.notes ?? []).not.toContain('circular_reference')
        expect(result.value).toEqual({
            a: { id: 'shared', count: 2 },
            b: { id: 'shared', count: 2 },
        })
    })

    test('sanitizes and hashes distinct dates without collapsing them', () => {
        const first = new Date('2026-01-01T00:00:00.000Z')
        const second = new Date('2026-01-02T00:00:00.000Z')

        expect(sanitizeTraceJson(first).value).toEqual({
            type: 'Date',
            value: '2026-01-01T00:00:00.000Z',
        })
        expect(sanitizeTraceJson(new Date(Number.NaN)).value).toEqual({
            type: 'Date',
            value: '[Invalid Date]',
        })
        expect(hashTraceValue(first)).not.toBe(hashTraceValue(second))
    })

    test('normalizes non-json primitives to json-safe sentinels', () => {
        const result = sanitizeTraceJson({
            nan: Number.NaN,
            positive: Number.POSITIVE_INFINITY,
            negative: Number.NEGATIVE_INFINITY,
            symbol: Symbol('s'),
        })

        expect(result.value).toEqual({
            nan: '[NonJsonNumber:NaN]',
            positive: '[NonJsonNumber:Infinity]',
            negative: '[NonJsonNumber:-Infinity]',
            symbol: '[Symbol:s]',
        })
        expect(hashTraceValue({ x: Number.NaN })).not.toBe(
            hashTraceValue({ x: null }),
        )
    })

    test('sanitizes built-ins into meaningful json-safe summaries', () => {
        const result = sanitizeTraceJson(
            {
                map: new Map<unknown, unknown>([
                    ['first', { count: 1 }],
                    ['second', Number.NaN],
                    ['third', 'truncated'],
                ]),
                set: new Set<unknown>(['a', Symbol('b'), 'c']),
                url: new URL('https://example.com/path?q=1'),
                regexp: /flux/gi,
                bytes: new Uint8Array([1, 2, 3]),
                buffer: new ArrayBuffer(4),
            },
            {
                maxBytes: 10_000,
                maxDepth: 8,
                maxArrayItems: 2,
                maxStringBytes: 10_000,
                redactKeys: [],
            },
        )

        expect(result.value).toEqual({
            map: {
                type: 'Map',
                entries: [
                    ['first', { count: 1 }],
                    ['second', '[NonJsonNumber:NaN]'],
                    '[Truncated 1 entries]',
                ],
            },
            set: {
                type: 'Set',
                values: ['a', '[Symbol:b]', '[Truncated 1 values]'],
            },
            url: {
                type: 'URL',
                value: 'https://example.com/path?q=1',
            },
            regexp: {
                type: 'RegExp',
                source: 'flux',
                flags: 'gi',
            },
            bytes: {
                type: 'Uint8Array',
                byteLength: 3,
                length: 3,
            },
            buffer: {
                type: 'ArrayBuffer',
                byteLength: 4,
            },
        })
        expect(result.notes).toContain('array_items_truncated')
    })

    test('redacts secret-shaped keys recursively', () => {
        const result = sanitizeTraceJson(
            {
                token: 'abc',
                nested: { apiKey: 'key', accountId: 'acct-1' },
                safe: 'visible',
            },
            {
                maxBytes: 10_000,
                maxDepth: 8,
                maxArrayItems: 50,
                maxStringBytes: 10_000,
                redactKeys: ['token', 'apiKey', 'accountId'],
            },
        )

        expect(result.redacted).toBe(true)
        expect(result.value).toEqual({
            token: '[Redacted]',
            nested: { apiKey: '[Redacted]', accountId: '[Redacted]' },
            safe: 'visible',
        })
    })

    test('truncates large arrays and records sizing metadata', () => {
        const result = sanitizeTraceJson(
            Array.from({ length: 5 }, (_, i) => i),
            {
                maxBytes: 10_000,
                maxDepth: 8,
                maxArrayItems: 3,
                maxStringBytes: 10_000,
                redactKeys: [],
            },
        )

        expect(result.truncated).toBe(true)
        expect(result.value).toEqual([0, 1, 2, '[Truncated 2 items]'])
        expect(result.notes).toContain('array_items_truncated')
        expect(result.originalSizeBytes).toBe(29)
        expect(result.keptSizeBytes).toBe(29)
    })

    test('truncates long error fields', () => {
        const error = Object.assign(new Error('x'.repeat(20)), {
            code: `E_${'Y'.repeat(20)}`,
        })
        error.stack = `stack-${'z'.repeat(20)}`

        const result = sanitizeTraceJson(error, {
            maxBytes: 10_000,
            maxDepth: 8,
            maxArrayItems: 50,
            maxStringBytes: 5,
            redactKeys: [],
        })

        expect(result.truncated).toBe(true)
        expect(result.notes).toContain('string_truncated')
        expect(result.value).toMatchObject({
            name: 'Error',
            message: 'xxxxx[Truncated string from 20 bytes]',
            code: 'E_YYY[Truncated string from 22 bytes]',
            stack: 'stack[Truncated string from 26 bytes]',
        })
    })

    test('stable stringify and hash are deterministic', () => {
        const left = { b: 2, a: { d: 4, c: 3 } }
        const right = { a: { c: 3, d: 4 }, b: 2 }

        expect(stableTraceStringify(left)).toBe(stableTraceStringify(right))
        expect(hashTraceValue(left)).toBe(hashTraceValue(right))
    })

    test('stable stringify and sizing handle circular values directly', () => {
        const cyclic: Record<string, unknown> = { b: 2, a: 1 }
        cyclic.self = cyclic

        expect(() => stableTraceStringify(cyclic)).not.toThrow()
        expect(stableTraceStringify(cyclic)).toBe(
            '{"a":1,"b":2,"self":"[Circular]"}',
        )
        expect(() => measureTraceJsonBytes(cyclic)).not.toThrow()
        expect(measureTraceJsonBytes(cyclic)).toBeGreaterThan(0)
    })

    test('stable stringify serializes shared object references in each branch', () => {
        const shared = { b: 2, a: 1 }

        expect(stableTraceStringify({ a: shared, b: shared })).toBe(
            '{"a":{"a":1,"b":2},"b":{"a":1,"b":2}}',
        )
        expect(() =>
            measureTraceJsonBytes({ a: shared, b: shared }),
        ).not.toThrow()
    })

    test('truncates trace text while leaving hashable original available to caller', () => {
        const result = truncateTraceText('abcdef', 3)
        expect(result).toEqual({
            text: 'abc[Truncated text from 6 bytes]',
            truncated: true,
            originalSizeBytes: 6,
        })
    })
})
