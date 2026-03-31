import { describe, expect, test, mock, spyOn } from 'bun:test'
import { skillPlugin } from '../../../../src/core/ai/plugins/skill'

function createMockDeps(overrides?: {
  skillToolReturn?: any
  bashToolReturn?: any
  shouldThrow?: boolean
}) {
  const mockSkillTool = { type: 'function', function: { name: 'loadSkill' } }
  const mockBashTool = { type: 'function', function: { name: 'bash' } }
  const mockReadFileTool = { type: 'function', function: { name: 'readFile' } }
  const mockWriteFileTool = { type: 'function', function: { name: 'writeFile' } }

  return {
    createSkillTool: mock(async () => {
      if (overrides?.shouldThrow) throw new Error('skill discovery failed')
      return overrides?.skillToolReturn ?? {
        skill: mockSkillTool,
        files: { 'scripts/greet.sh': 'echo hello' },
        instructions: '## Available Skills\n- hello-world: A test skill',
      }
    }),
    createBashTool: mock(async () => {
      if (overrides?.shouldThrow) throw new Error('bash tool failed')
      return overrides?.bashToolReturn ?? {
        tools: {
          bash: mockBashTool,
          readFile: mockReadFileTool,
          writeFile: mockWriteFileTool,
        },
      }
    }),
  }
}

describe('skillPlugin', () => {
  test('has name "skill"', () => {
    const deps = createMockDeps()
    const plugin = skillPlugin({ skillsDirectory: './skills', deps })
    expect(plugin.name).toBe('skill')
  })

  test('init calls createSkillTool with skillsDirectory', async () => {
    const deps = createMockDeps()
    const plugin = skillPlugin({ skillsDirectory: '/path/to/skills', deps })
    await plugin.init!()
    expect(deps.createSkillTool).toHaveBeenCalledWith({
      skillsDirectory: '/path/to/skills',
    })
  })

  test('init calls createBashTool with files from skill discovery', async () => {
    const deps = createMockDeps()
    const plugin = skillPlugin({ skillsDirectory: './skills', deps })
    await plugin.init!()
    expect(deps.createBashTool).toHaveBeenCalledTimes(1)
    const call = (deps.createBashTool as any).mock.calls[0][0]
    expect(call.files).toEqual({ 'scripts/greet.sh': 'echo hello' })
    expect(call.onBeforeBashCall).toBeDefined()
  })

  test('tools() returns 4 tools after init', async () => {
    const deps = createMockDeps()
    const plugin = skillPlugin({ skillsDirectory: './skills', deps })
    await plugin.init!()
    const tools = (plugin.tools as Function)()
    expect(Object.keys(tools)).toEqual(['loadSkill', 'bash', 'readFile', 'writeFile'])
  })

  test('tools() returns empty before init', () => {
    const deps = createMockDeps()
    const plugin = skillPlugin({ skillsDirectory: './skills', deps })
    const tools = (plugin.tools as Function)()
    expect(Object.keys(tools)).toHaveLength(0)
  })

  test('systemPrompt() returns instructions after init', async () => {
    const deps = createMockDeps()
    const plugin = skillPlugin({ skillsDirectory: './skills', deps })
    await plugin.init!()
    const prompt = (plugin.systemPrompt as Function)()
    expect(prompt).toContain('Available Skills')
    expect(prompt).toContain('hello-world')
  })

  test('systemPrompt() returns empty string before init', () => {
    const deps = createMockDeps()
    const plugin = skillPlugin({ skillsDirectory: './skills', deps })
    const prompt = (plugin.systemPrompt as Function)()
    expect(prompt).toBe('')
  })

  test('gracefully degrades when init fails', async () => {
    const consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
    const deps = createMockDeps({ shouldThrow: true })
    const plugin = skillPlugin({ skillsDirectory: './skills', deps })

    await plugin.init!() // should NOT throw

    const tools = (plugin.tools as Function)()
    expect(Object.keys(tools)).toHaveLength(0)
    const prompt = (plugin.systemPrompt as Function)()
    expect(prompt).toBe('')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  test('logs warning when no skills found', async () => {
    const consoleSpy = spyOn(console, 'warn').mockImplementation(() => {})
    const deps = createMockDeps({
      skillToolReturn: { skill: {}, files: {}, instructions: '' },
    })
    const plugin = skillPlugin({ skillsDirectory: './empty', deps })

    await plugin.init!()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No skills found')
    )
    consoleSpy.mockRestore()
  })

  test('each tool is wrapped in ToolDefinition format', async () => {
    const deps = createMockDeps()
    const plugin = skillPlugin({ skillsDirectory: './skills', deps })
    await plugin.init!()
    const tools = (plugin.tools as Function)()
    for (const [_name, def] of Object.entries(tools)) {
      expect(def).toHaveProperty('tool')
    }
  })
})
