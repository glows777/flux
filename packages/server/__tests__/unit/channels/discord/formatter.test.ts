import { describe, expect, test } from 'bun:test'
import { splitMessage } from '@/channels/discord/formatter'

describe('splitMessage', () => {
    test('returns single chunk for short messages', () => {
        const result = splitMessage('Hello world')
        expect(result).toEqual(['Hello world'])
    })

    test('returns single chunk for exactly max length', () => {
        const exact = 'a'.repeat(2000)
        const result = splitMessage(exact)
        expect(result).toEqual([exact])
    })

    test('splits long messages at newlines', () => {
        const long = 'a'.repeat(1800) + '\n' + 'b'.repeat(400)
        const result = splitMessage(long)
        expect(result.length).toBe(2)
        expect(result[0]).toBe('a'.repeat(1800))
        expect(result[1]).toBe('b'.repeat(400))
    })

    test('splits at spaces when no newline available', () => {
        const words = Array(300).fill('word').join(' ')
        const extra = ' ' + 'x'.repeat(600)
        const long = words + extra
        const result = splitMessage(long)
        expect(result.length).toBe(2)
        for (const chunk of result) {
            expect(chunk.length).toBeLessThanOrEqual(2000)
        }
    })

    test('hard splits when no good break point', () => {
        const long = 'a'.repeat(3000)
        const result = splitMessage(long)
        expect(result.length).toBe(2)
        expect(result[0].length).toBe(2000)
        expect(result[1].length).toBe(1000)
    })

    test('handles empty string', () => {
        const result = splitMessage('')
        expect(result).toEqual([''])
    })
})
