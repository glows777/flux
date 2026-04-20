import {
    createBashTool as createBashToolDefault,
    experimental_createSkillTool as createSkillToolDefault,
} from 'bash-tool'
import type {
    AIPlugin,
    ContextSegment,
    ToolContribution,
    ToolDefinition,
} from '../../runtime/types'
import { createWhitelist } from './whitelist'

type CreateSkillToolFn = typeof createSkillToolDefault
type CreateBashToolFn = typeof createBashToolDefault
type SkillTool = Awaited<ReturnType<CreateSkillToolFn>>['skill']
type BashTools = Awaited<ReturnType<CreateBashToolFn>>['tools']

function toToolContribution(name: string, tool: unknown): ToolContribution {
    const definition: ToolDefinition = { tool: tool as never }

    return {
        name,
        definition,
        source: 'skill',
        manifestSpec: {
            description: (tool as { description?: string }).description,
            inputSchemaSummary: (tool as { inputSchema?: unknown }).inputSchema,
        },
    }
}

export interface SkillPluginDeps {
    createSkillTool: CreateSkillToolFn
    createBashTool: CreateBashToolFn
}

export interface SkillPluginOptions {
    skillsDirectory: string
    allowedCommands?: string[]
    deps?: Partial<SkillPluginDeps>
}

export function skillPlugin(options: SkillPluginOptions): AIPlugin {
    const _createSkillTool =
        options.deps?.createSkillTool ?? createSkillToolDefault
    const _createBashTool =
        options.deps?.createBashTool ?? createBashToolDefault

    let skillTool: SkillTool | null = null
    let bashTools: BashTools | null = null
    let skillInstructions = ''

    return {
        name: 'skill',

        async init() {
            try {
                const { skill, files, instructions } = await _createSkillTool({
                    skillsDirectory: options.skillsDirectory,
                })

                if (!instructions || instructions.trim() === '') {
                    console.warn(
                        `[skill-plugin] No skills found in ${options.skillsDirectory}`,
                    )
                }

                const { tools } = await _createBashTool({
                    files,
                    onBeforeBashCall: createWhitelist(options.allowedCommands),
                })

                skillTool = skill
                bashTools = tools
                skillInstructions = instructions
            } catch (error) {
                console.error(
                    '[skill-plugin] Init failed, plugin disabled:',
                    error,
                )
            }
        },

        contribute() {
            const segments: ContextSegment[] = []

            if (skillInstructions) {
                segments.push({
                    id: 'skill-instructions',
                    target: 'system',
                    kind: 'system.instructions',
                    payload: { format: 'text', text: skillInstructions },
                    source: { plugin: 'skill' },
                    priority: 'high',
                    cacheability: 'stable',
                    compactability: 'preserve',
                })
            }

            const tools =
                skillTool && bashTools
                    ? [
                          toToolContribution('loadSkill', skillTool),
                          toToolContribution('bash', bashTools.bash),
                          toToolContribution('readFile', bashTools.readFile),
                          toToolContribution('writeFile', bashTools.writeFile),
                      ]
                    : []

            if (segments.length === 0 && tools.length === 0) {
                return {}
            }

            return {
                segments: segments.length > 0 ? segments : undefined,
                tools: tools.length > 0 ? tools : undefined,
            }
        },
    }
}
