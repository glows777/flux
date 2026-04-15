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

    test('provides only display tools', () => {
        const mockCreate = mock(() => ({
            getQuote: {},
            display_rating_card: {},
            display_comparison_table: {},
            display_signal_badges: {},
        }))
        const plugin = displayPlugin({ deps: { createTools: mockCreate } })
        const tools = plugin.tools as Record<string, unknown>
        const names = Object.keys(tools)
        expect(names).toEqual([
            'display_rating_card',
            'display_comparison_table',
            'display_signal_badges',
        ])
        expect(names).not.toContain('getQuote')
    })
})
