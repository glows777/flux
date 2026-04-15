import {
    createBashTool as createBashToolDefault,
    experimental_createSkillTool as createSkillToolDefault,
} from 'bash-tool'
import type { AIPlugin, ToolMap } from '../../runtime/types'
import { createWhitelist } from './whitelist'

type CreateSkillToolFn = typeof createSkillToolDefault
type CreateBashToolFn = typeof createBashToolDefault
type SkillTool = Awaited<ReturnType<CreateSkillToolFn>>['skill']
type BashTools = Awaited<ReturnType<CreateBashToolFn>>['tools']

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

        systemPrompt() {
            if (!skillInstructions) return ''
            return skillInstructions
        },

        tools(): ToolMap {
            if (!skillTool || !bashTools) return {}
            return {
                loadSkill: { tool: skillTool },
                bash: { tool: bashTools.bash },
                readFile: { tool: bashTools.readFile },
                writeFile: { tool: bashTools.writeFile },
            }
        },
    }
}
