import type { AIPlugin, HookContext, AfterChatContext, ToolMap } from '../../runtime/types'
import { createMemoryTools as defaultCreateMemoryTools } from '../../memory/tools'
import { appendTranscript } from '../../memory/store'
import { loadMessagesForTranscript } from '../../session'
import { cleanMessages } from '../../memory/transcript-cleaner'
import { scheduleReindex } from '../../memory/transcript-indexer'

interface MemoryPluginDeps {
  createMemoryTools: (deps?: any) => Record<string, any>
  processTranscript: (ctx: AfterChatContext) => Promise<void>
}

interface MemoryPluginOptions {
  withTranscript?: boolean
  skipTranscript?: boolean
  deps?: MemoryPluginDeps
}

async function defaultProcessTranscript(ctx: AfterChatContext): Promise<void> {
  const allMessages = await loadMessagesForTranscript(ctx.sessionId)
  // Only process the latest round (last 2 messages: user + assistant)
  // to match finalizeChatRound behavior and avoid transcript bloat
  const latestRound = allMessages.slice(-2)
  const cleaned = cleanMessages(latestRound)
  if (!cleaned) return
  const docId = await appendTranscript(ctx.sessionId, cleaned, ctx.symbol)
  if (docId) scheduleReindex(docId)
}

function wrapToolsAsDefinitions(rawTools: Record<string, any>): ToolMap {
  const map: ToolMap = {}
  for (const [name, tool] of Object.entries(rawTools)) {
    map[name] = { tool }
  }
  return map
}

export function memoryPlugin(options?: MemoryPluginOptions): AIPlugin {
  const withTranscript = options?.withTranscript !== false && options?.skipTranscript !== true
  const deps: MemoryPluginDeps = options?.deps ?? {
    createMemoryTools: defaultCreateMemoryTools,
    processTranscript: defaultProcessTranscript,
  }

  return {
    name: 'memory',
    tools(_ctx: HookContext): ToolMap {
      return wrapToolsAsDefinitions(deps.createMemoryTools())
    },
    async afterChat(ctx: AfterChatContext): Promise<void> {
      if (withTranscript) {
        await deps.processTranscript(ctx)
      }
    },
  }
}
