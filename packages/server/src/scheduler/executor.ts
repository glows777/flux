import type { CronJob } from '@prisma/client'
import type { GatewayRouter } from '@/gateway/router'
import type { AgentType } from '@/core/ai/runtime/types'

export interface ExecutionResult {
    readonly success: boolean
    readonly output?: string
    readonly error?: string
}

interface ExecutorDeps {
    readonly gateway: GatewayRouter
}

export class TaskExecutor {
    constructor(private readonly deps: ExecutorDeps) {}

    async execute(job: CronJob): Promise<ExecutionResult> {
        const payload = job.taskPayload as { prompt?: string }
        if (!payload.prompt) {
            return { success: false, error: 'Job payload missing prompt' }
        }

        try {
            const output = await this.deps.gateway.chat({
                channel: 'cron',
                agentType: job.taskType as AgentType,
                content: payload.prompt,
                channelId: `cron:${job.id}`,
                userId: job.userId,
            })

            const { text } = await output.consumeStream()
            return { success: true, output: text?.trim() || '(no response)' }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            return { success: false, output: `Cron job failed: ${message}`, error: message }
        }
    }
}
