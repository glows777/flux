import { createHash } from 'node:crypto'

export interface TraceJsonOptions {
    maxBytes: number
    maxDepth: number
    maxArrayItems: number
    maxStringBytes: number
    redactKeys: string[]
}

export interface SafeTraceJson {
    value: unknown
    truncated: boolean
    redacted: boolean
    originalSizeBytes?: number
    keptSizeBytes?: number
    notes?: string[]
}

export const DEFAULT_TRACE_JSON_OPTIONS: TraceJsonOptions = {
    maxBytes: 32 * 1024,
    maxDepth: 12,
    maxArrayItems: 200,
    maxStringBytes: 8 * 1024,
    redactKeys: [
        'token',
        'apiKey',
        'secret',
        'password',
        'authorization',
        'cookie',
        'alpacaKey',
        'accountId',
    ],
}

const textEncoder = new TextEncoder()

function byteLength(value: string): number {
    return textEncoder.encode(value).byteLength
}

function shouldRedactKey(key: string, redactKeys: readonly string[]): boolean {
    const normalized = key.toLowerCase()
    return redactKeys.some((candidate) =>
        normalized.includes(candidate.toLowerCase()),
    )
}

function truncateStringByBytes(value: string, maxBytes: number): string {
    let kept = ''
    for (const char of value) {
        if (byteLength(kept + char) > maxBytes) break
        kept += char
    }
    return kept
}

function normalizeNonJsonPrimitive(value: unknown): unknown {
    if (typeof value === 'number' && !Number.isFinite(value)) {
        if (Number.isNaN(value)) return '[NonJsonNumber:NaN]'
        return value > 0
            ? '[NonJsonNumber:Infinity]'
            : '[NonJsonNumber:-Infinity]'
    }
    if (typeof value === 'symbol') {
        return value.description == null
            ? '[Symbol]'
            : `[Symbol:${value.description}]`
    }
    return value
}

function compareCodeUnits(left: string, right: string): number {
    if (left < right) return -1
    if (left > right) return 1
    return 0
}

function normalizeValue(
    value: unknown,
    options: TraceJsonOptions,
    seen: WeakSet<object>,
    depth: number,
    notes: Set<string>,
    redacted: { value: boolean },
): unknown {
    if (depth > options.maxDepth) {
        notes.add('max_depth_reached')
        return '[MaxDepth]'
    }

    value = normalizeNonJsonPrimitive(value)
    if (value === undefined) return '[Undefined]'
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'function') return '[Function]'
    if (typeof value === 'string') {
        const size = byteLength(value)
        if (size <= options.maxStringBytes) return value
        notes.add('string_truncated')
        return `${truncateStringByBytes(value, options.maxStringBytes)}[Truncated string from ${size} bytes]`
    }
    if (typeof value !== 'object' || value === null) return value

    if (seen.has(value)) {
        notes.add('circular_reference')
        return '[Circular]'
    }
    seen.add(value)
    try {
        if (value instanceof Date) {
            return {
                type: 'Date',
                value: Number.isNaN(value.getTime())
                    ? '[Invalid Date]'
                    : value.toISOString(),
            }
        }

        if (value instanceof URL) {
            return {
                type: 'URL',
                value: normalizeValue(
                    value.toString(),
                    options,
                    seen,
                    depth + 1,
                    notes,
                    redacted,
                ),
            }
        }

        if (value instanceof RegExp) {
            return {
                type: 'RegExp',
                source: normalizeValue(
                    value.source,
                    options,
                    seen,
                    depth + 1,
                    notes,
                    redacted,
                ),
                flags: normalizeValue(
                    value.flags,
                    options,
                    seen,
                    depth + 1,
                    notes,
                    redacted,
                ),
            }
        }

        if (value instanceof ArrayBuffer) {
            return {
                type: 'ArrayBuffer',
                byteLength: value.byteLength,
            }
        }

        if (ArrayBuffer.isView(value)) {
            const record: Record<string, unknown> = {
                type: value.constructor.name,
                byteLength: value.byteLength,
            }
            const length = (value as { length?: unknown }).length
            if (typeof length === 'number') record.length = length
            return record
        }

        if (value instanceof Map) {
            const entries: unknown[] = []
            let index = 0
            for (const [key, item] of value) {
                if (index >= options.maxArrayItems) break
                const normalizedKey = normalizeValue(
                    key,
                    options,
                    seen,
                    depth + 1,
                    notes,
                    redacted,
                )
                const shouldRedactMapValue =
                    typeof key === 'string' &&
                    shouldRedactKey(key, options.redactKeys)
                const normalizedItem = shouldRedactMapValue
                    ? '[Redacted]'
                    : normalizeValue(
                          item,
                          options,
                          seen,
                          depth + 1,
                          notes,
                          redacted,
                      )
                if (shouldRedactMapValue) redacted.value = true
                entries.push([normalizedKey, normalizedItem])
                index += 1
            }
            if (value.size > options.maxArrayItems) {
                notes.add('array_items_truncated')
                entries.push(
                    `[Truncated ${value.size - options.maxArrayItems} entries]`,
                )
            }
            return {
                type: 'Map',
                entries,
            }
        }

        if (value instanceof Set) {
            const values: unknown[] = []
            let index = 0
            for (const item of value) {
                if (index >= options.maxArrayItems) break
                values.push(
                    normalizeValue(
                        item,
                        options,
                        seen,
                        depth + 1,
                        notes,
                        redacted,
                    ),
                )
                index += 1
            }
            if (value.size > options.maxArrayItems) {
                notes.add('array_items_truncated')
                values.push(
                    `[Truncated ${value.size - options.maxArrayItems} values]`,
                )
            }
            return {
                type: 'Set',
                values,
            }
        }

        if (value instanceof Error) {
            const record: Record<string, unknown> = {
                name: normalizeValue(
                    value.name,
                    options,
                    seen,
                    depth + 1,
                    notes,
                    redacted,
                ),
                message: normalizeValue(
                    value.message,
                    options,
                    seen,
                    depth + 1,
                    notes,
                    redacted,
                ),
            }
            const code = (value as { code?: unknown }).code
            if (typeof code === 'string') {
                record.code = normalizeValue(
                    code,
                    options,
                    seen,
                    depth + 1,
                    notes,
                    redacted,
                )
            }
            if (typeof value.stack === 'string') {
                record.stack = normalizeValue(
                    value.stack,
                    options,
                    seen,
                    depth + 1,
                    notes,
                    redacted,
                )
            }
            return record
        }

        if (Array.isArray(value)) {
            const kept = value
                .slice(0, options.maxArrayItems)
                .map((item) =>
                    normalizeValue(
                        item,
                        options,
                        seen,
                        depth + 1,
                        notes,
                        redacted,
                    ),
                )
            if (value.length > options.maxArrayItems) {
                notes.add('array_items_truncated')
                kept.push(
                    `[Truncated ${value.length - options.maxArrayItems} items]`,
                )
            }
            return kept
        }

        const record: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(value)) {
            if (shouldRedactKey(key, options.redactKeys)) {
                record[key] = '[Redacted]'
                redacted.value = true
                continue
            }
            record[key] = normalizeValue(
                item,
                options,
                seen,
                depth + 1,
                notes,
                redacted,
            )
        }
        return record
    } finally {
        seen.delete(value)
    }
}

export function stableTraceStringify(value: unknown): string {
    const sorted = sortForStableStringify(value, new WeakSet<object>())
    const serialized = JSON.stringify(sorted)
    return serialized === undefined ? 'undefined' : serialized
}

function sortForStableStringify(
    value: unknown,
    seen: WeakSet<object>,
): unknown {
    value = normalizeNonJsonPrimitive(value)
    if (value === undefined) return '[Undefined]'
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'function') return '[Function]'
    if (value == null || typeof value !== 'object') return value

    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    try {
        if (Array.isArray(value)) {
            return value.map((item) => sortForStableStringify(item, seen))
        }

        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => compareCodeUnits(left, right))
                .map(([key, item]) => [
                    key,
                    sortForStableStringify(item, seen),
                ]),
        )
    } finally {
        seen.delete(value)
    }
}

export function hashTraceValue(value: unknown): string {
    const safe = sanitizeTraceJson(value, {
        ...DEFAULT_TRACE_JSON_OPTIONS,
        maxBytes: Number.MAX_SAFE_INTEGER,
        maxArrayItems: Number.MAX_SAFE_INTEGER,
        maxStringBytes: Number.MAX_SAFE_INTEGER,
        redactKeys: [],
    })
    return createHash('sha256')
        .update(stableTraceStringify(safe.value))
        .digest('hex')
}

export function hashTraceText(text: string): string {
    return createHash('sha256').update(text).digest('hex')
}

export function sanitizeTraceJson(
    value: unknown,
    options: TraceJsonOptions = DEFAULT_TRACE_JSON_OPTIONS,
): SafeTraceJson {
    const notes = new Set<string>()
    const redacted = { value: false }
    const normalized = normalizeValue(
        value,
        options,
        new WeakSet<object>(),
        0,
        notes,
        redacted,
    )

    const originalSerialized = stableTraceStringify(normalized)
    const originalSizeBytes = byteLength(originalSerialized)
    let keptValue = normalized
    let keptSizeBytes = originalSizeBytes
    let truncated = notes.size > 0

    if (originalSizeBytes > options.maxBytes) {
        const marker = `[TraceJson truncated from ${originalSizeBytes} bytes]`
        keptValue = marker
        keptSizeBytes = byteLength(JSON.stringify(marker))
        truncated = true
        notes.add('max_bytes_truncated')
    }

    return {
        value: keptValue,
        truncated,
        redacted: redacted.value,
        originalSizeBytes,
        keptSizeBytes,
        ...(notes.size > 0 ? { notes: Array.from(notes).sort() } : {}),
    }
}

export function measureTraceJsonBytes(value: unknown): number {
    return byteLength(stableTraceStringify(value))
}

export function truncateTraceText(
    text: string,
    maxBytes = 64 * 1024,
): { text: string; truncated: boolean; originalSizeBytes: number } {
    const originalSizeBytes = byteLength(text)
    if (originalSizeBytes <= maxBytes) {
        return { text, truncated: false, originalSizeBytes }
    }
    const kept = truncateStringByBytes(text, maxBytes)
    return {
        text: `${kept}[Truncated text from ${originalSizeBytes} bytes]`,
        truncated: true,
        originalSizeBytes,
    }
}
