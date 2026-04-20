import type { StoreDeps } from '../../memory/store'
import { createHistoryTool, createMemoryTools } from '../../memory/tools'
import type { AIPlugin, ToolDefinition } from '../../runtime/types'
import { createToolContributions } from '../shared/tool-contributions'

interface MemoryPluginOptions {
    /** 是否包含 read_history 工具（仅 auto-trading-agent 使用）*/
    includeHistory?: boolean
    /** 测试用依赖注入 */
    deps?: StoreDeps
}

function wrapTools(
    rawTools: Record<string, unknown>,
): Record<string, ToolDefinition> {
    const map: Record<string, ToolDefinition> = {}
    for (const [name, tool] of Object.entries(rawTools)) {
        map[name] = { tool: tool as never }
    }
    return map
}

export function memoryPlugin(options?: MemoryPluginOptions): AIPlugin {
    return {
        name: 'memory',

        contribute() {
            const base = createMemoryTools(options?.deps)
            const tools = options?.includeHistory
                ? wrapTools({
                      ...base,
                      ...createHistoryTool(options?.deps),
                  })
                : wrapTools(base)

            return {
                tools: createToolContributions('memory', tools),
            }
        },
        // afterRun 暂不实现（background extraction 后续 cron 迭代）
    }
}
