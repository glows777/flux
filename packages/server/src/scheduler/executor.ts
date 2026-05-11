import type { CronJob } from '@prisma/client'
import { type AgentRunStore, createRunId } from '@/core/ai/agent-run'
import type { TracePhase, TraceRecorder } from '@/core/ai/agent-run-trace'
import type { AgentType } from '@/core/ai/runtime/types'
import type { Gateway } from '@/gateway/gateway'
import type { TriggerResult } from '@/gateway/router'

export interface ExecutionResult {
    readonly status: 'success' | 'error' | 'timeout'
    readonly success: boolean
    readonly runId: string
    readonly output?: string
    readonly error?: string
}

interface ExecutorDeps {
    readonly gateway: Gateway
    readonly agentRunStore: AgentRunStore
    readonly traceRecorder?: TraceRecorder
    readonly timeoutMs?: number
}

const EXECUTION_TIMEOUT_MS = 20 * 60 * 1000 // 20 minutes

export class TaskExecutor {
    private readonly timeoutMs: number

    constructor(private readonly deps: ExecutorDeps) {
        this.timeoutMs = deps.timeoutMs ?? EXECUTION_TIMEOUT_MS
    }

    async execute(job: CronJob): Promise<ExecutionResult> {
        const runId = createRunId()
        const payload = job.taskPayload as { prompt?: string }
        if (!payload.prompt) {
            const error = new Error('Job payload missing prompt')
            await this.recordFailedRun({
                runId,
                source: 'cron',
                mode: 'trigger',
                agentType: job.taskType as AgentType,
                cronJobId: job.id,
                userId: job.userId,
                sourceId: `cron:${job.id}`,
                error,
            })
            return {
                status: 'error',
                success: false,
                runId,
                error: error.message,
            }
        }

        const controller = new AbortController()
        let timer: Timer | undefined
        try {
            const result = await Promise.race([
                this.run(job, payload.prompt, runId, controller.signal),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => {
                        controller.abort()
                        reject(new Error('Execution timed out'))
                    }, this.timeoutMs)
                }),
            ])
            clearTimeout(timer)
            return result
        } catch (error) {
            clearTimeout(timer)

            const message =
                error instanceof Error ? error.message : 'Unknown error'
            if (message === 'Execution timed out') {
                await this.recordFailedRun(
                    {
                        runId,
                        source: 'cron',
                        mode: 'trigger',
                        agentType: job.taskType as AgentType,
                        cronJobId: job.id,
                        userId: job.userId,
                        sourceId: `cron:${job.id}`,
                        error,
                        code: 'TIMEOUT',
                    },
                    'model_stream',
                )
                return {
                    status: 'timeout',
                    success: false,
                    runId,
                    output: `Cron job timed out: ${message}`,
                    error: message,
                }
            }

            await this.recordFailedRun({
                runId,
                source: 'cron',
                mode: 'trigger',
                agentType: job.taskType as AgentType,
                cronJobId: job.id,
                userId: job.userId,
                sourceId: `cron:${job.id}`,
                error,
            })
            return {
                status: 'error',
                success: false,
                runId,
                output: `Cron job failed: ${message}`,
                error: message,
            }
        }
    }

    private async run(
        job: CronJob,
        prompt: string,
        runId: string,
        abortSignal: AbortSignal,
    ): Promise<ExecutionResult> {
        const channelTarget = job.channelTarget as {
            type: string
            channelId: string
        } | null

        const triggerResult: TriggerResult = await this.deps.gateway.chat({
            runId,
            channel: 'cron',
            mode: 'trigger',
            agentType: job.taskType as AgentType,
            content: prompt,
            sourceId: `cron:${job.id}`,
            userId: job.userId,
            cronJobId: job.id,
            abortSignal,
            ...(channelTarget ? { channelTarget } : {}),
        })

        const triggerRunId = triggerResult.runId || runId

        if (!triggerResult.success) {
            await this.recordFailedRun(
                {
                    runId: triggerRunId,
                    source: 'cron',
                    mode: 'trigger',
                    agentType: job.taskType as AgentType,
                    cronJobId: job.id,
                    userId: job.userId,
                    sourceId: `cron:${job.id}`,
                    error: new Error(
                        triggerResult.error ?? 'Cron trigger failed',
                    ),
                },
                triggerResult.failurePhase ?? 'before_run',
            )
        }

        return {
            status: triggerResult.success ? 'success' : 'error',
            success: triggerResult.success,
            runId: triggerRunId,
            output: triggerResult.text?.trim() || '(no response)',
            ...(triggerResult.error ? { error: triggerResult.error } : {}),
        }
    }

    private async recordFailedRun(
        input: Parameters<AgentRunStore['createFailedRun']>[0],
        phase: TracePhase = 'before_run',
    ): Promise<void> {
        let runId = input.runId

        try {
            const result = await this.deps.agentRunStore.createFailedRun(input)
            runId = result.runId
        } catch (error) {
            console.error('Failed to record agent run failure:', error)
        }

        if (!this.deps.traceRecorder || !runId) return

        try {
            await this.deps.traceRecorder.recordMinimalFailure({
                runId,
                source: 'cron_executor',
                phase,
                error: input.error,
                runContext: {
                    source: input.source,
                    mode: input.mode,
                    agentType: input.agentType as AgentType,
                    cronJobId: input.cronJobId,
                    userId: input.userId,
                    sourceId: input.sourceId,
                },
            })
        } catch (error) {
            console.error('Failed to record agent run failure trace:', error)
        }
    }
}
