import { resolve } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import type { AlpacaClient } from '@/core/broker/alpaca-client'
import type { StoreDeps } from '../memory'
import { autoTradingPromptPlugin } from '../plugins/auto-trading-prompt'
import { autoTradingToolsPlugin } from '../plugins/auto-trading-tools'
import { heartbeatPlugin } from '../plugins/heartbeat'
import { memoryPlugin } from '../plugins/memory'
import { sessionPlugin } from '../plugins/session'
import { skillPlugin } from '../plugins/skill'
import type { ResearchDeps } from '../research'
import type { AIPlugin } from '../runtime/types'
import type { ToolDeps } from '../tools'

export interface AutoTradingAgentPresetDeps {
    alpacaClient: AlpacaClient
    db: PrismaClient
    toolDeps: ToolDeps
    memoryDeps?: StoreDeps
    researchDeps?: ResearchDeps
}

export function autoTradingAgentPreset(
    deps: AutoTradingAgentPresetDeps,
): AIPlugin[] {
    const tradingAgentDeps = {
        alpacaClient: deps.alpacaClient,
        db: deps.db,
        toolDeps: deps.toolDeps,
        memoryDeps: deps.memoryDeps,
        researchDeps: deps.researchDeps,
    }

    return [
        // heartbeat MUST come before auto-trading-prompt (beforeChat sets ctx.meta.heartbeat)
        heartbeatPlugin({
            alpacaClient: deps.alpacaClient,
            db: deps.db,
            memoryDeps: deps.memoryDeps,
        }),
        autoTradingPromptPlugin(),
        sessionPlugin(),
        memoryPlugin({ includeHistory: true }),
        skillPlugin({
            skillsDirectory: resolve(import.meta.dir, '../../../../skills'),
        }),
        autoTradingToolsPlugin({ tradingAgentDeps }),
    ]
}
