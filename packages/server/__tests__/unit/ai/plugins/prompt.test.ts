import { describe, expect, test } from 'bun:test'
import { promptPlugin } from '../../../../src/core/ai/plugins/prompt'

describe('promptPlugin', () => {
    test('has name "prompt"', () => {
        expect(promptPlugin().name).toBe('prompt')
    })

    test('contribute returns separate base and memory segments', async () => {
        const plugin = promptPlugin({
            deps: {
                loadMemoryContext: async () => '## User Profile\nprefers ETFs',
                buildGlobalBasePrompt: () => '你是 Flux OS 的 AI 金融分析师。',
                buildMemoryToolInstructions: () =>
                    '## 记忆工具\n你的上下文在每次新对话时会重置。',
                buildDisplayToolInstructions: () =>
                    '## 展示工具使用规则\n- 每轮回复最多调用一个展示工具',
                buildSearchToolInstructions: () =>
                    '## 联网搜索\n你有两个联网工具：webSearch 和 webFetch。',
            },
        })

        const output = await plugin.contribute?.({
            sessionId: 's1',
            channel: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        } as never)

        expect(output?.segments?.map((segment) => segment.kind)).toEqual([
            'system.base',
            'memory.long_lived',
            'system.instructions',
        ])
    })
})
