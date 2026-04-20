import { describe, expect, mock, test } from 'bun:test'
import { dataPlugin } from '../../../../src/core/ai/plugins/data'

describe('dataPlugin', () => {
    test('has name "data"', () => {
        expect(
            dataPlugin({ deps: { createTools: mock(() => ({})) } }).name,
        ).toBe('data')
    })

    test('contribute returns data tools and excludes display tools', () => {
        const plugin = dataPlugin({
            deps: {
                createTools: mock(() => ({
                    getQuote: {},
                    getCompanyInfo: {},
                    getHistory: {},
                    calculateIndicators: {},
                    getReport: {},
                    searchStock: {},
                    display_rating_card: {},
                    display_comparison_table: {},
                    display_signal_badges: {},
                })),
            },
        })

        const output = plugin.contribute?.({} as never)
        const names = output?.tools?.map((tool) => tool.name) ?? []

        expect(names).toHaveLength(6)
        expect(names).toContain('getQuote')
        expect(names).not.toContain('display_rating_card')
    })

    test('throws when deps.createTools is not provided', () => {
        expect(() => dataPlugin()).toThrow(
            'dataPlugin requires deps.createTools',
        )
    })
})
