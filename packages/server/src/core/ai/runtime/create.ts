import type { UIMessage } from 'ai'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { assembleContextRequest } from './assembly'
import {
    attachAssembledContextSnapshot,
    attachModelRequestSnapshot,
    attachPluginOutputsSnapshot,
    attachResultSnapshot,
    createBaseManifest,
} from './context-manifest'
import {
    collectPluginOutputs,
    runAfterRunHooks,
    runBeforeRunHooks,
    runOnErrorHooks,
} from './execute'
import type {
    AIRuntime,
    ChatInput,
    ChatOutput,
    ChatParams,
    ConsumedResult,
    RunContext,
    RuntimeOptions,
    ToolCallRecord,
} from './types'
import { DEFAULT_CHAT_PARAMS } from './types'

interface StepWithToolCalls {
    readonly toolCalls?: Array<{
        readonly toolName: string
        readonly args: unknown
    }>
    readonly toolResults?: Array<{
        readonly result?: unknown
    }>
}

function createRunId(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return crypto.randomUUID()
    }

    return `run_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function validatePluginNames(plugins: RuntimeOptions['plugins']): void {
    const seen = new Set<string>()
    for (const plugin of plugins) {
        if (seen.has(plugin.name)) {
            throw new Error(`Duplicate plugin name: "${plugin.name}"`)
        }
        seen.add(plugin.name)
    }
}

function extractToolCalls(steps: unknown): ToolCallRecord[] {
    const records: ToolCallRecord[] = []

    try {
        if (!Array.isArray(steps)) return records

        for (const step of steps) {
            const { toolCalls: calls = [], toolResults: results = [] } =
                step as StepWithToolCalls

            for (let i = 0; i < calls.length; i++) {
                records.push({
                    toolName: calls[i].toolName,
                    args: calls[i].args,
                    result: results[i]?.result ?? null,
                })
            }
        }
    } catch {
        // Best-effort extraction for partially mocked stream results.
    }

    return records
}

function buildProviderOptions(
    params: Partial<ChatParams>,
): Record<string, unknown> {
    const providerOptions: Record<string, unknown> = {}

    if (params.thinkingBudget != null) {
        providerOptions.anthropic = {
            thinking: {
                type: 'enabled',
                budgetTokens: params.thinkingBudget,
            },
        }
    }

    return providerOptions
}

function resolveMaxOutputTokens(
    params: Partial<ChatParams>,
): number | undefined {
    return params.maxTokens
}

export async function createAIRuntime(
    options: RuntimeOptions,
): Promise<AIRuntime> {
    const { model, plugins, defaults } = options

    validatePluginNames(plugins)

    for (const plugin of plugins) {
        if (plugin.init != null) {
            await plugin.init()
        }
    }

    const baseParams: ChatParams = {
        ...DEFAULT_CHAT_PARAMS,
        ...defaults,
    }

    async function chat(input: ChatInput): Promise<ChatOutput> {
        const runId = createRunId()
        const runCtx: RunContext = {
            sessionId: input.sessionId ?? '',
            symbol: input.symbol,
            channel: input.channel,
            mode: input.mode,
            agentType: input.agentType ?? 'trading-agent',
            rawMessages: input.messages,
            meta: new Map(),
        }

        if (input.sourceId) runCtx.meta.set('sourceId', input.sourceId)
        if (input.userId) runCtx.meta.set('userId', input.userId)

        try {
            await runBeforeRunHooks(plugins, runCtx)

            if (runCtx.meta.has('sessionId')) {
                runCtx.sessionId = runCtx.meta.get('sessionId') as string
            }

            const collectedOutputs = await collectPluginOutputs(plugins, runCtx)
            const assembledBase = assembleContextRequest({
                rawMessages: input.messages,
                outputs: collectedOutputs,
                defaults: baseParams,
            })
            const providerOptions = buildProviderOptions(assembledBase.resolved)
            const resolvedMaxOutputTokens = resolveMaxOutputTokens(
                assembledBase.resolved,
            )
            const assembled = {
                ...assembledBase,
                providerOptions,
                resolvedMaxOutputTokens,
            }

            let manifest = createBaseManifest({
                runId,
                input,
                resolvedSessionId: runCtx.sessionId || undefined,
                defaults: baseParams as unknown as Record<string, unknown>,
            })

            manifest = attachPluginOutputsSnapshot(manifest, collectedOutputs)
            manifest = attachAssembledContextSnapshot(manifest, {
                segments: assembled.segments,
                systemSegments: assembled.systemSegments,
                tools: assembled.manifestTools,
                params: {
                    candidates: assembled.candidates,
                    resolved: assembled.resolved,
                },
                totalEstimatedInputTokens: assembled.totalEstimatedInputTokens,
            })
            manifest = attachModelRequestSnapshot(manifest, {
                systemText: assembled.systemText,
                modelMessages: assembled.modelMessages,
                toolNames: Object.keys(assembled.aiTools),
                resolvedParams: assembled.resolved,
                maxOutputTokens: assembled.resolvedMaxOutputTokens,
                providerOptions: assembled.providerOptions,
            })

            const streamResult = streamText({
                model,
                system: assembled.systemText || undefined,
                messages: await convertToModelMessages(assembled.modelMessages),
                tools: assembled.aiTools as never,
                stopWhen: stepCountIs(
                    assembled.resolved.maxSteps ?? baseParams.maxSteps,
                ) as never,
                temperature: assembled.resolved.temperature,
                ...(assembled.resolvedMaxOutputTokens != null
                    ? { maxOutputTokens: assembled.resolvedMaxOutputTokens }
                    : {}),
                ...(Object.keys(assembled.providerOptions).length > 0
                    ? { providerOptions: assembled.providerOptions }
                    : {}),
            } as never) as unknown as ChatOutput['streamResult']

            let finalized = false
            let finalizedData:
                | {
                      text: string
                      usage: ConsumedResult['usage']
                      toolCalls: ToolCallRecord[]
                  }
                | undefined

            async function resolveFinalizedData() {
                if (finalizedData) return finalizedData

                const [text, usage, steps] = await Promise.all([
                    streamResult.text,
                    streamResult.usage,
                    streamResult.steps,
                ])

                finalizedData = {
                    text,
                    usage: {
                        inputTokens: usage.inputTokens,
                        outputTokens: usage.outputTokens,
                    },
                    toolCalls: extractToolCalls(steps),
                }

                return finalizedData
            }

            async function finalize(responseMessage: UIMessage): Promise<void> {
                if (finalized) return
                finalized = true

                const { text, usage, toolCalls } = await resolveFinalizedData()
                manifest = attachResultSnapshot(manifest, {
                    text,
                    responseMessage,
                    toolCalls,
                    usage,
                })

                await runAfterRunHooks(plugins, {
                    ...runCtx,
                    text,
                    responseMessage,
                    toolCalls,
                    usage,
                    contextManifest: manifest,
                })
            }

            async function consumeStream(): Promise<ConsumedResult> {
                let capturedResponseMessage: UIMessage | null = null

                const uiStream = streamResult.toUIMessageStream({
                    sendReasoning: true,
                    onFinish: ({ responseMessage }) => {
                        capturedResponseMessage = responseMessage
                    },
                })

                const reader = uiStream.getReader()
                try {
                    while (true) {
                        const { done } = await reader.read()
                        if (done) break
                    }
                } finally {
                    reader.releaseLock()
                }

                if (capturedResponseMessage == null) {
                    throw new Error(
                        'Stream finished without producing a responseMessage',
                    )
                }

                await finalize(capturedResponseMessage)
                const { text, usage, toolCalls } = await resolveFinalizedData()

                return {
                    text,
                    responseMessage: capturedResponseMessage,
                    toolCalls,
                    usage,
                    contextManifest: manifest,
                }
            }

            return {
                streamResult,
                sessionId: runCtx.sessionId,
                consumeStream,
                finalize,
                getContextManifest: () => manifest,
            }
        } catch (error) {
            const err =
                error instanceof Error ? error : new Error(String(error))
            await runOnErrorHooks(plugins, runCtx, err)
            throw err
        }
    }

    async function dispose(): Promise<void> {
        await Promise.allSettled(
            plugins.map(async (plugin) => {
                if (plugin.destroy == null) return

                try {
                    await plugin.destroy()
                } catch (error) {
                    console.error(`[${plugin.name}] destroy() failed:`, error)
                }
            }),
        )
    }

    return { chat, dispose }
}
