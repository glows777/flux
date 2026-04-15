import type { CronJob } from '@prisma/client'
import type { AgentType } from '@/core/ai/runtime/types'
import type { Gateway } from '@/gateway/gateway'
import type { TriggerResult } from '@/gateway/router'

export interface ExecutionResult {
    readonly success: boolean
    readonly output?: string
    readonly error?: string
}

interface ExecutorDeps {
    readonly gateway: Gateway
}

const EXECUTION_TIMEOUT_MS = 20 * 60 * 1000 // 20 minutes

export class TaskExecutor {
    constructor(private readonly deps: ExecutorDeps) {}

    async execute(job: CronJob): Promise<ExecutionResult> {
        const payload = job.taskPayload as { prompt?: string }
        if (!payload.prompt) {
            return { success: false, error: 'Job payload missing prompt' }
        }

        let timer: Timer | undefined
        try {
            const result = await Promise.race([
                this.run(job, payload.prompt),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error('Execution timed out')),
                        EXECUTION_TIMEOUT_MS,
                    )
                }),
            ])
            clearTimeout(timer)
            return result
        } catch (error) {
            clearTimeout(timer)

            const message =
                error instanceof Error ? error.message : 'Unknown error'
            return {
                success: false,
                output: `Cron job failed: ${message}`,
                error: message,
            }
        }
    }

    private async run(job: CronJob, prompt: string): Promise<ExecutionResult> {
        const channelTarget = job.channelTarget as {
            type: string
            channelId: string
        } | null

        const triggerResult: TriggerResult = await this.deps.gateway.chat({
            channel: 'cron',
            mode: 'trigger',
            agentType: job.taskType as AgentType,
            content: prompt,
            sourceId: `cron:${job.id}`,
            userId: job.userId,
            ...(channelTarget ? { channelTarget } : {}),
        })

        return {
            success: triggerResult.success,
            output: triggerResult.text?.trim() || '(no response)',
            ...(triggerResult.error ? { error: triggerResult.error } : {}),
        }
    }
}
