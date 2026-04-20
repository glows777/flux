import { describe, expect, mock, test } from 'bun:test'
import type { StoreDeps } from '../../../../src/core/ai/memory/store'
import { memoryPlugin } from '../../../../src/core/ai/plugins/memory'

function makeMockDb() {
    return {
        memoryVersion: {
            findFirst: mock(() => Promise.resolve(null)),
            findMany: mock(() => Promise.resolve([])),
            create: mock(() => Promise.resolve({ id: 'v1' })),
        },
    } as unknown as StoreDeps['db']
}

describe('memoryPlugin', () => {
    test('has name "memory"', () => {
        expect(memoryPlugin().name).toBe('memory')
    })

    test('contribute returns update_core_memory and save_lesson by default', async () => {
        const plugin = memoryPlugin({ deps: { db: makeMockDb() } })
        const output = await plugin.contribute?.({} as never)
        const names = output?.tools?.map((tool) => tool.name) ?? []

        expect(names).toContain('update_core_memory')
        expect(names).toContain('save_lesson')
        expect(names).not.toContain('read_history')
        expect(names).toHaveLength(2)
    })

    test('contribute includes read_history when includeHistory=true', async () => {
        const plugin = memoryPlugin({
            includeHistory: true,
            deps: { db: makeMockDb() },
        })
        const output = await plugin.contribute?.({} as never)
        const names = output?.tools?.map((tool) => tool.name) ?? []

        expect(names).toContain('update_core_memory')
        expect(names).toContain('save_lesson')
        expect(names).toContain('read_history')
        expect(names).toHaveLength(3)
    })

    test('does NOT provide afterRun hook', () => {
        expect(memoryPlugin().afterRun).toBeUndefined()
    })
})
