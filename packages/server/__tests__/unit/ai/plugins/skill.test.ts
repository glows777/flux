import { describe, expect, mock, spyOn, test } from 'bun:test'
import { skillPlugin } from '../../../../src/core/ai/plugins/skill'

function createMockDeps(overrides?: {
    skillToolReturn?: {
        skill: Record<string, unknown>
        files: Record<string, string>
        instructions: string
    }
    bashToolReturn?: {
        tools: Record<string, unknown>
    }
    shouldThrow?: boolean
}) {
    const mockSkillTool = { type: 'function', function: { name: 'loadSkill' } }
    const mockBashTool = { type: 'function', function: { name: 'bash' } }
    const mockReadFileTool = {
        type: 'function',
        function: { name: 'readFile' },
    }
    const mockWriteFileTool = {
        type: 'function',
        function: { name: 'writeFile' },
    }

    return {
        createSkillTool: mock(async () => {
            if (overrides?.shouldThrow)
                throw new Error('skill discovery failed')
            return (
                overrides?.skillToolReturn ?? {
                    skill: mockSkillTool,
                    files: { 'scripts/greet.sh': 'echo hello' },
                    instructions:
                        '## Available Skills\n- hello-world: A test skill',
                }
            )
        }),
        createBashTool: mock(async () => {
            if (overrides?.shouldThrow) throw new Error('bash tool failed')
            return (
                overrides?.bashToolReturn ?? {
                    tools: {
                        bash: mockBashTool,
                        readFile: mockReadFileTool,
                        writeFile: mockWriteFileTool,
                    },
                }
            )
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
        expect(plugin.init).toBeDefined()
        if (!plugin.init) throw new Error('Expected init hook')

        await plugin.init()
        expect(deps.createSkillTool).toHaveBeenCalledWith({
            skillsDirectory: '/path/to/skills',
        })
    })

    test('init calls createBashTool with files from skill discovery', async () => {
        const deps = createMockDeps()
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })
        expect(plugin.init).toBeDefined()
        if (!plugin.init) throw new Error('Expected init hook')

        await plugin.init()
        expect(deps.createBashTool).toHaveBeenCalledTimes(1)
        const call = (deps.createBashTool as ReturnType<typeof mock>).mock
            .calls[0][0] as {
            files: Record<string, string>
            onBeforeBashCall: unknown
        }
        expect(call.files).toEqual({ 'scripts/greet.sh': 'echo hello' })
        expect(call.onBeforeBashCall).toBeDefined()
    })

    test('tools() returns 4 tools after init', async () => {
        const deps = createMockDeps()
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })
        expect(plugin.init).toBeDefined()
        if (!plugin.init) throw new Error('Expected init hook')
        if (typeof plugin.tools !== 'function') {
            throw new Error('Expected tools factory')
        }

        await plugin.init()
        const tools = plugin.tools()
        expect(Object.keys(tools)).toEqual([
            'loadSkill',
            'bash',
            'readFile',
            'writeFile',
        ])
    })

    test('tools() returns empty before init', () => {
        const deps = createMockDeps()
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })
        if (typeof plugin.tools !== 'function') {
            throw new Error('Expected tools factory')
        }

        const tools = plugin.tools()
        expect(Object.keys(tools)).toHaveLength(0)
    })

    test('systemPrompt() returns instructions after init', async () => {
        const deps = createMockDeps()
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })
        expect(plugin.init).toBeDefined()
        if (!plugin.init) throw new Error('Expected init hook')
        if (typeof plugin.systemPrompt !== 'function') {
            throw new Error('Expected systemPrompt factory')
        }

        await plugin.init()
        const prompt = plugin.systemPrompt()
        expect(prompt).toContain('Available Skills')
        expect(prompt).toContain('hello-world')
    })

    test('systemPrompt() returns empty string before init', () => {
        const deps = createMockDeps()
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })
        if (typeof plugin.systemPrompt !== 'function') {
            throw new Error('Expected systemPrompt factory')
        }

        const prompt = plugin.systemPrompt()
        expect(prompt).toBe('')
    })

    test('gracefully degrades when init fails', async () => {
        const consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
        const deps = createMockDeps({ shouldThrow: true })
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })

        expect(plugin.init).toBeDefined()
        if (!plugin.init) throw new Error('Expected init hook')
        if (typeof plugin.tools !== 'function') {
            throw new Error('Expected tools factory')
        }
        if (typeof plugin.systemPrompt !== 'function') {
            throw new Error('Expected systemPrompt factory')
        }

        await plugin.init() // should NOT throw

        const tools = plugin.tools()
        expect(Object.keys(tools)).toHaveLength(0)
        const prompt = plugin.systemPrompt()
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

        expect(plugin.init).toBeDefined()
        if (!plugin.init) throw new Error('Expected init hook')

        await plugin.init()

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('No skills found'),
        )
        consoleSpy.mockRestore()
    })

    test('each tool is wrapped in ToolDefinition format', async () => {
        const deps = createMockDeps()
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })
        expect(plugin.init).toBeDefined()
        if (!plugin.init) throw new Error('Expected init hook')
        if (typeof plugin.tools !== 'function') {
            throw new Error('Expected tools factory')
        }

        await plugin.init()
        const tools = plugin.tools()
        for (const [_name, def] of Object.entries(tools)) {
            expect(def).toHaveProperty('tool')
        }
    })
})
