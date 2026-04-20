import { buildTradingAgentInstructions } from '@/core/trading-agent/prompt'
import type { AIPlugin } from '../../runtime/types'

export function autoTradingPromptPlugin(): AIPlugin {
    return {
        name: 'auto-trading-prompt',

        contribute() {
            return {
                segments: [
                    {
                        id: 'auto-trading-instructions',
                        target: 'system',
                        kind: 'system.instructions',
                        payload: {
                            format: 'text',
                            text: buildTradingAgentInstructions(),
                        },
                        source: { plugin: 'auto-trading-prompt' },
                        priority: 'high',
                        cacheability: 'stable',
                        compactability: 'preserve',
                    },
                ],
            }
        },
    }
}
