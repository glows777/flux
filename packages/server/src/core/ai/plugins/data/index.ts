import type { AIPlugin, ToolMap } from '../../runtime/types'

const DISPLAY_TOOL_NAMES = new Set(['display_rating_card', 'display_comparison_table', 'display_signal_badges'])

interface DataPluginDeps {
  createTools: (...args: any[]) => Record<string, any>
}

interface DataPluginOptions {
  deps?: DataPluginDeps
}

function wrapToolsAsDefinitions(rawTools: Record<string, any>): ToolMap {
  const map: ToolMap = {}
  for (const [name, tool] of Object.entries(rawTools)) {
    map[name] = { tool }
  }
  return map
}

export function dataPlugin(options?: DataPluginOptions): AIPlugin {
  const createTools = options?.deps?.createTools
  if (!createTools) {
    throw new Error('dataPlugin requires deps.createTools or production toolDeps to be provided')
  }

  const allTools = createTools()
  const filtered: Record<string, any> = {}
  for (const [name, tool] of Object.entries(allTools)) {
    if (!DISPLAY_TOOL_NAMES.has(name)) filtered[name] = tool
  }

  return {
    name: 'data',
    tools: wrapToolsAsDefinitions(filtered),
  }
}
