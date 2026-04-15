/**
 * buildAgentSystemPrompt Unit Tests
 *
 * Test scenarios:
 * - T02-10: Includes symbol and name
 * - T02-11: Name omitted — no empty parentheses
 * - T02-12: Output length < 1000 characters
 */

import { describe, expect, it } from 'bun:test'
import { buildAgentSystemPrompt } from '@/core/ai/prompts'

describe('buildAgentSystemPrompt', () => {
    it('T02-10: includes symbol and name', () => {
        const result = buildAgentSystemPrompt('AAPL', 'Apple Inc.')

        expect(result).toContain('AAPL')
        expect(result).toContain('(Apple Inc.)')
    })

    it('T02-11: name omitted — no empty parentheses', () => {
        const result = buildAgentSystemPrompt('AAPL')

        expect(result).toContain('AAPL')
        expect(result).not.toContain('()')
    })

    it('T02-12: output length < 2000 characters (includes display + search + trading rules)', () => {
        const result = buildAgentSystemPrompt('AAPL', 'Apple Inc.')

        expect(result.length).toBeLessThan(2000)
    })

    it('contains key instruction elements', () => {
        const result = buildAgentSystemPrompt('AAPL', 'Apple Inc.')

        expect(result).toContain('Flux')
        expect(result).toContain('中文')
        expect(result).toContain('Markdown')
    })

    describe('display tool rules', () => {
        it('P2-T08: prompt 包含展示工具使用规则', () => {
            const result = buildAgentSystemPrompt('AAPL')

            expect(result).toContain('展示工具使用规则')
            expect(result).toContain('display_*')
        })

        it('P2-T09: 展示工具规则始终存在', () => {
            const result = buildAgentSystemPrompt('AAPL')

            expect(result).toContain('展示工具使用规则')
        })

        it('P2-T09b: 展示工具规则在带 options 时也存在', () => {
            const result = buildAgentSystemPrompt('AAPL', undefined, {
                memoryContext: 'test',
            })

            expect(result).toContain('展示工具使用规则')
            expect(result).toContain('display_*')
        })
    })
})
