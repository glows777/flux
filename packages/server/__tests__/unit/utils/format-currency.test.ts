/**
 * Task 04: Format utility tests for currency/percent functions
 */

import { describe, expect, it } from 'bun:test'
import {
    formatCurrency,
    formatPercent,
    formatSignedCurrency,
} from '@flux/shared'

describe('formatCurrency', () => {
    it('T04-01: formats positive value', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56')
    })

    it('T04-02: formats zero', () => {
        expect(formatCurrency(0)).toBe('$0.00')
    })

    it('T04-03: formats large value', () => {
        expect(formatCurrency(124592)).toBe('$124,592.00')
    })
})

describe('formatSignedCurrency', () => {
    it('T04-04: positive value gets + prefix', () => {
        expect(formatSignedCurrency(1840.5)).toBe('+$1,840.50')
    })

    it('T04-05: negative value gets - prefix', () => {
        expect(formatSignedCurrency(-500.25)).toBe('-$500.25')
    })

    it('T04-06: zero gets + prefix', () => {
        expect(formatSignedCurrency(0)).toBe('+$0.00')
    })
})

describe('formatPercent', () => {
    it('T04-07: positive percent gets + prefix', () => {
        expect(formatPercent(1.4)).toBe('+1.40%')
    })

    it('T04-08: negative percent', () => {
        expect(formatPercent(-2.5)).toBe('-2.50%')
    })

    it('T04-09: zero percent', () => {
        expect(formatPercent(0)).toBe('+0.00%')
    })
})
