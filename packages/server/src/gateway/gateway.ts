import type { ChannelAdapter } from '@/channels/types'
import { createRunId } from '@/core/ai/agent-run'
import type { ChatOutput } from '@/core/ai/runtime/types'
import type { GatewayInput, Router, TriggerResult } from './router'

interface GatewayDeps {
    readonly router: Router
    readonly channels: Map<string, ChannelAdapter>
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
}
