import { describe, expect, mock, test } from 'bun:test'
import { researchPlugin } from '../../../../src/core/ai/plugins/research'

describe('researchPlugin', () => {
    test('has name "research"', () => {
        expect(
            researchPlugin({
                deps: {
                    createResearchTools: mock(() => ({
                        webSearch: {},
                        webFetch: {},
                    })),
                },
            }).name,
        ).toBe('research')
    })

    test('contribute returns webSearch and webFetch tools', () => {
        const plugin = researchPlugin({
            deps: { createResearchTools: mock(() => ({ webSearch: {}, webFetch: {} })) },
        })

        const output = plugin.contribute?.({} as never)
        const names = output?.tools?.map((tool) => tool.name) ?? []

        expect(names).toContain('webSearch')
        expect(names).toContain('webFetch')
    })
})
