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

        await plugin.init()
        const output = await plugin.contribute?.({
            sessionId: 'skill-test',
            channel: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        } as never)
        expect(output?.tools?.map((tool) => tool.name)).toEqual([
            'loadSkill',
            'bash',
            'readFile',
            'writeFile',
        ])
    })

    test('contribute() returns empty before init', async () => {
        const deps = createMockDeps()
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })

        const output = await plugin.contribute?.({
            sessionId: 'skill-test',
            channel: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        } as never)
        expect(output?.tools).toBeUndefined()
    })

    test('contribute() returns instructions after init', async () => {
        const deps = createMockDeps()
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })
        expect(plugin.init).toBeDefined()
        if (!plugin.init) throw new Error('Expected init hook')

        await plugin.init()
        const output = await plugin.contribute?.({
            sessionId: 'skill-test',
            channel: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        } as never)
        const prompt = output?.segments?.[0].payload
        if (!prompt || prompt.format !== 'text') {
            throw new Error('Expected text segment payload')
        }
        expect(prompt.text).toContain('Available Skills')
        expect(prompt.text).toContain('hello-world')
    })

    test('contribute() returns no instructions before init', async () => {
        const deps = createMockDeps()
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })

        const output = await plugin.contribute?.({
            sessionId: 'skill-test',
            channel: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        } as never)
        expect(output?.segments).toBeUndefined()
    })

    test('gracefully degrades when init fails', async () => {
        const consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
        const deps = createMockDeps({ shouldThrow: true })
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })

        expect(plugin.init).toBeDefined()
        if (!plugin.init) throw new Error('Expected init hook')

        await plugin.init() // should NOT throw

        const output = await plugin.contribute?.({
            sessionId: 'skill-test',
            channel: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        } as never)
        expect(output?.tools).toBeUndefined()
        expect(output?.segments).toBeUndefined()
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

    test('each tool is wrapped in ToolContribution format', async () => {
        const deps = createMockDeps()
        const plugin = skillPlugin({ skillsDirectory: './skills', deps })
        expect(plugin.init).toBeDefined()
        if (!plugin.init) throw new Error('Expected init hook')

        await plugin.init()
        const output = await plugin.contribute?.({
            sessionId: 'skill-test',
            channel: 'web',
            mode: 'conversation',
            agentType: 'trading-agent',
            rawMessages: [],
            meta: new Map(),
        } as never)
        for (const tool of output?.tools ?? []) {
            expect(tool.definition).toHaveProperty('tool')
        }
    })
})
