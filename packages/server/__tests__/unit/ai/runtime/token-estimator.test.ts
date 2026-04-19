import { describe, expect, test } from 'bun:test'
import {
    estimateMessages,
    estimateTextTokens,
    estimateToolSpec,
} from '../../../../src/core/ai/runtime/token-estimator'

describe('token-estimator', () => {
    test('estimates mixed CJK and ASCII text deterministically', () => {
        const first = estimateTextTokens('你好 AAPL earnings')
        const second = estimateTextTokens('你好 AAPL earnings')

        expect(first).toBe(second)
        expect(first).toBeGreaterThan(0)
    })

    test('adds message framing overhead', () => {
        const total = estimateMessages([
            {
                id: 'm1',
                role: 'user',
                parts: [{ type: 'text', text: 'hello world' }],
            },
        ])

        expect(total).toBeGreaterThan(estimateTextTokens('hello world'))
    })

    test('estimates tool surface from manifest spec only', () => {
        const total = estimateToolSpec({
            description: 'Get quote',
            inputSchemaSummary: {
                type: 'object',
                properties: { symbol: { type: 'string' } },
            },
        })

        expect(total).toBeGreaterThan(0)
    })
})

