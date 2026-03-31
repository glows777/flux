import { describe, test, expect } from 'bun:test'
import { buildGlobalSystemPrompt } from '@/core/ai/prompts'

describe('buildGlobalSystemPrompt', () => {
    test('returns generic prompt without symbol', () => {
        const prompt = buildGlobalSystemPrompt()

        expect(prompt).toContain('Flux OS')
        expect(prompt).toContain('AI 金融分析师')
        expect(prompt).toContain('searchStock')
        expect(prompt).toContain('展示工具使用规则')
        expect(prompt).toContain('联网搜索')
        expect(prompt).not.toContain('用户当前关注')
    })

    test('appends symbol context when provided', () => {
        const prompt = buildGlobalSystemPrompt({
            symbol: 'AAPL',
            name: 'Apple Inc.',
        })

        expect(prompt).toContain('用户当前关注 AAPL (Apple Inc.)')
    })

    test('includes memory context when provided', () => {
        const prompt = buildGlobalSystemPrompt({
            memoryContext: '## 用户档案\n偏好价值投资',
        })

        expect(prompt).toContain('用户档案')
        expect(prompt).toContain('记忆工具')
    })

})
