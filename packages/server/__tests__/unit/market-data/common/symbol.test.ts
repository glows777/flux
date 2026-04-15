import { describe, expect, test } from 'bun:test'
import {
    isValidSymbol,
    normalizeSymbol,
} from '@/core/market-data/common/symbol'

describe('isValidSymbol', () => {
    test('accepts valid stock symbols', () => {
        expect(isValidSymbol('AAPL')).toBe(true)
        expect(isValidSymbol('BRK.B')).toBe(true)
        expect(isValidSymbol('^VIX')).toBe(true)
        expect(isValidSymbol('^TNX')).toBe(true)
        expect(isValidSymbol('BTC-USD')).toBe(true)
    })

    test('rejects invalid symbols', () => {
        expect(isValidSymbol('')).toBe(false)
        expect(isValidSymbol('TOOLONGSYMBOL')).toBe(false)
        expect(isValidSymbol('A B')).toBe(false)
        expect(isValidSymbol('AAPL!')).toBe(false)
        expect(isValidSymbol('<script>')).toBe(false)
    })
})

describe('normalizeSymbol', () => {
    test('uppercases and trims', () => {
        expect(normalizeSymbol('aapl')).toBe('AAPL')
        expect(normalizeSymbol(' MSFT ')).toBe('MSFT')
        expect(normalizeSymbol(' aapl ')).toBe('AAPL')
    })
})
