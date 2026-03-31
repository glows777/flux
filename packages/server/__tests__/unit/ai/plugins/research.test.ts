import { describe, expect, test, mock } from 'bun:test'
import { researchPlugin } from '../../../../src/core/ai/plugins/research'

describe('researchPlugin', () => {
  test('has name "research"', () => {
    expect(researchPlugin({ deps: { createResearchTools: mock(() => ({ webSearch: {}, webFetch: {} })) } }).name).toBe('research')
  })

  test('provides webSearch and webFetch tools', () => {
    const mockCreate = mock(() => ({ webSearch: {}, webFetch: {} }))
    const plugin = researchPlugin({ deps: { createResearchTools: mockCreate } })
    const tools = plugin.tools as any
    expect(Object.keys(tools)).toContain('webSearch')
    expect(Object.keys(tools)).toContain('webFetch')
  })
})
