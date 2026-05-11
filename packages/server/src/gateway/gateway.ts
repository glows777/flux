import type { ChannelAdapter } from '@/channels/types'
import { type AgentRunStore, createRunId } from '@/core/ai/agent-run'
import type { TracePhase, TraceRecorder } from '@/core/ai/agent-run-trace'
import type { ChatOutput } from '@/core/ai/runtime/types'
import type { GatewayInput, Router, TriggerResult } from './router'

interface GatewayDeps {
    readonly router: Router
    readonly channels: Map<string, ChannelAdapter>
    readonly agentRunStore: AgentRunStore
    readonly traceRecorder?: TraceRecorder
}

export class Gateway {
    constructor(private readonly deps: GatewayDeps) {}

    async chat(
        input: GatewayInput & { mode: 'conversation' },
    ): Promise<ChatOutput>
    async chat(
        input: GatewayInput & { mode: 'trigger' },
    ): Promise<TriggerResult>
    async chat(input: GatewayInput): Promise<ChatOutput | TriggerResult> {
        if (input.mode === 'trigger') {
            return this.handleTrigger(input)
        }
        return this.deps.router.chat(input)
    }

    async clearSession(params: {
        readonly channel: string
        readonly sourceId: string
        readonly createdBy: string
    }): Promise<{ id: string }> {
        return this.deps.router.clearSession(params)
    }

    private async handleTrigger(input: GatewayInput): Promise<TriggerResult> {
        const runId = input.runId ?? createRunId()
        const normalizedInput: GatewayInput = { ...input, runId }

        let output: ChatOutput
        try {
            output = await this.deps.router.chat(normalizedInput)
        } catch (error) {
            console.error('Gateway trigger AI execution failed:', error)
            await this.recordBoundaryFailure(
                normalizedInput,
                runId,
                'before_run',
                error,
            )
            const message =
                error instanceof Error ? error.message : 'Unknown error'
            return {
                text: '',
                sessionId: normalizedInput.sessionId ?? '',
                runId,
                success: false,
                error: message,
            }
        }

        let consumed: Awaited<ReturnType<ChatOutput['consumeStream']>>
        try {
            consumed = await output.consumeStream()
        } catch (error) {
            console.error('Gateway trigger stream consumption failed:', error)
            await this.recordBoundaryFailure(
                normalizedInput,
                output.runId,
                'model_stream',
                error,
            )
            const message =
                error instanceof Error ? error.message : 'Unknown error'
            return {
                text: '',
                sessionId: output.sessionId,
                runId: output.runId,
                success: false,
                error: message,
            }
        }

        const { text } = consumed

        if (normalizedInput.abortSignal?.aborted) {
            const abortedError = Object.assign(new Error('Execution aborted'), {
                code: 'ABORTED',
            })
            try {
                await output.recordFailure(abortedError)
            } catch (error) {
                console.error(
                    'Gateway trigger abort failure recording failed:',
                    error,
                )
            }
            return {
                text: '',
                sessionId: output.sessionId,
                runId: output.runId,
                success: false,
                error: 'Execution aborted',
            }
        }

        if (normalizedInput.channelTarget) {
            const adapter = this.deps.channels.get(
                normalizedInput.channelTarget.type,
            )
            if (adapter) {
                try {
                    await adapter.send(
                        { channelId: normalizedInput.channelTarget.channelId },
                        { content: text },
                    )
                } catch (error) {
                    console.error(
                        `Gateway push to ${normalizedInput.channelTarget.type} failed:`,
                        error,
                    )
                }
            }
        }

        return {
            text,
            sessionId: output.sessionId,
            runId: output.runId,
            success: true,
        }
    }

    private async recordBoundaryFailure(
        input: GatewayInput,
        runId: string,
        phase: TracePhase,
        error: unknown,
    ): Promise<void> {
        const agentType = input.agentType ?? 'trading-agent'
        let recordedRunId = runId

        try {
            const result = await this.deps.agentRunStore.createFailedRun({
                runId,
                source: input.channel,
                mode: input.mode,
                agentType,
                sessionId: input.sessionId,
                cronJobId: input.cronJobId,
                userId: input.userId,
                sourceId: input.sourceId,
                inputSummary: input.content,
                error,
            })
            recordedRunId = result.runId
        } catch (recordError) {
            console.error('Gateway failed-run recording failed:', recordError)
        }

        if (!this.deps.traceRecorder) return

        try {
            await this.deps.traceRecorder.recordMinimalFailure({
                runId: recordedRunId,
                source: 'gateway',
                phase,
                error,
                runContext: {
                    source: input.channel,
                    mode: input.mode,
                    agentType,
                    cronJobId: input.cronJobId,
                    userId: input.userId,
                    sourceId: input.sourceId,
                },
            })
        } catch (traceError) {
            console.error('Gateway trace failure recording failed:', traceError)
        }
    }
}
