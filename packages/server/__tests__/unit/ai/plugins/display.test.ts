import { describe, expect, mock, test } from 'bun:test'
import { displayPlugin } from '../../../../src/core/ai/plugins/display'

describe('displayPlugin', () => {
    test('has name "display"', () => {
        expect(
            displayPlugin({
                deps: {
                    createTools: mock(() => ({
                        display_rating_card: {},
                        display_comparison_table: {},
                        display_signal_badges: {},
                    })),
                },
            }).name,
        ).toBe('display')
    })

    test('contribute returns only display tools', () => {
        const plugin = displayPlugin({
            deps: {
                createTools: mock(() => ({
                    getQuote: {},
                    display_rating_card: {},
                    display_comparison_table: {},
                    display_signal_badges: {},
                })),
            },
        })

        const output = plugin.contribute?.({} as never)
        const names = output?.tools?.map((tool) => tool.name) ?? []

        expect(names).toEqual([
            'display_rating_card',
            'display_comparison_table',
            'display_signal_badges',
        ])
        expect(names).not.toContain('getQuote')
    })
})
