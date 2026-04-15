import type { StoreDeps } from '../../memory/store'
import { createHistoryTool, createMemoryTools } from '../../memory/tools'
import type { AIPlugin, HookContext, ToolMap } from '../../runtime/types'

interface MemoryPluginOptions {
    /** 是否包含 read_history 工具（仅 auto-trading-agent 使用）*/
    includeHistory?: boolean
    /** 测试用依赖注入 */
    deps?: StoreDeps
}

function wrapTools(rawTools: Record<string, unknown>): ToolMap {
    const map: ToolMap = {}
    for (const [name, t] of Object.entries(rawTools)) {
        map[name] = { tool: t }
    }
    return map
}

export function memoryPlugin(options?: MemoryPluginOptions): AIPlugin {
    return {
        name: 'memory',

        tools(_ctx: HookContext): ToolMap {
            const base = createMemoryTools(options?.deps)
            if (options?.includeHistory) {
                const history = createHistoryTool(options?.deps)
                return wrapTools({ ...base, ...history })
            }
            return wrapTools(base)
        },
        // afterChat 暂不实现（background extraction 后续 cron 迭代）
    }
}
