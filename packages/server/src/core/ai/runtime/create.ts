import type { UIMessage } from 'ai'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { ToolConflictError } from './errors'
import {
    collectSystemPrompts,
    collectTools,
    runAfterChatHooks,
    runBeforeChatHooks,
    runOnErrorHooks,
    runTransformChain,
} from './execute'
import type {
    AfterChatContext,
    AIPlugin,
    AIRuntime,
    ChatInput,
    ChatOutput,
    ChatParams,
    ConsumedResult,
    FinishedResult,
    HookContext,
    RuntimeOptions,
    ToolCallRecord,
    ToolDisplayMap,
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

// ── Validation ──

function validatePluginNames(plugins: AIPlugin[]): void {
    const seen = new Set<string>()
    for (const plugin of plugins) {
        if (seen.has(plugin.name)) {
            throw new Error(`Duplicate plugin name: "${plugin.name}"`)
        }
        seen.add(plugin.name)
    }
}

function validateStaticToolUniqueness(plugins: AIPlugin[]): void {
    const ownership: Record<string, string> = {}
    for (const plugin of plugins) {
        if (plugin.tools == null || typeof plugin.tools === 'function') continue
        for (const toolName of Object.keys(plugin.tools)) {
            if (ownership[toolName] != null) {
                throw new ToolConflictError(
                    toolName,
                    ownership[toolName],
                    plugin.name,
                )
            }
            ownership[toolName] = plugin.name
        }
    }
}

// ── Display Map ──

function buildStaticDisplayMap(plugins: AIPlugin[]): ToolDisplayMap {
    const map: ToolDisplayMap = {}
    for (const plugin of plugins) {
        if (plugin.tools == null || typeof plugin.tools === 'function') continue
        for (const [toolName, def] of Object.entries(plugin.tools)) {
            if (def.display != null) {
                map[toolName] = def.display
            }
        }
    }
    return map
}

// ── Tool Call Extraction ──

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
        // Best-effort extraction
    }
    return records
}

// ── Factory ──

export async function createAIRuntime(
    options: RuntimeOptions,
): Promise<AIRuntime> {
    const { model, plugins, defaults } = options

    // 1. Validate
    validatePluginNames(plugins)
    validateStaticToolUniqueness(plugins)

    // 2. Initialize plugins sequentially (order matters)
    for (const plugin of plugins) {
        if (plugin.init != null) {
            await plugin.init()
        }
    }

    // 3. Pre-build static display map
    const staticDisplayMap = buildStaticDisplayMap(plugins)

    // 4. Build base params
    const baseParams: ChatParams = {
        ...DEFAULT_CHAT_PARAMS,
        ...defaults,
    }

    // ── chat() ──

    async function chat(input: ChatInput): Promise<ChatOutput> {
        const { messages, symbol, channel } = input

        // Mutable context — beforeChat hooks can set sessionId via meta
        const hookCtx: HookContext = {
            sessionId: input.sessionId ?? '',
            symbol,
            channel,
            mode: input.mode,
            agentType: input.agentType ?? 'trading-agent',
            rawMessages: messages,
            meta: new Map(),
        }

        // Pass through channel-specific identifiers for sessionPlugin
        if (input.sourceId) hookCtx.meta.set('sourceId', input.sourceId)
        if (input.userId) hookCtx.meta.set('userId', input.userId)

        try {
            // Phase 0: beforeChat (serial, side-effects, can set sessionId)
            await runBeforeChatHooks(plugins, hookCtx)

            // If beforeChat set a sessionId via meta, apply it
            if (hookCtx.meta.has('sessionId')) {
                hookCtx.sessionId = hookCtx.meta.get('sessionId') as string
            }

            // Parallel: collect system prompts + tools
            const [systemPrompt, toolMap] = await Promise.all([
                collectSystemPrompts(plugins, hookCtx),
                collectTools(plugins, hookCtx),
            ])

            // Serial transforms
            const transformedMessages = await runTransformChain(
                plugins,
                'transformMessages',
                hookCtx,
                messages,
            )

            const transformedParams = await runTransformChain(
                plugins,
                'transformParams',
                hookCtx,
                baseParams,
            )

            // Extract raw AI tools from ToolMap
            const aiTools: Record<string, unknown> = {}
            for (const [name, def] of Object.entries(toolMap)) {
                aiTools[name] = def.tool
            }

            // Convert messages to model format
            const modelMessages =
                await convertToModelMessages(transformedMessages)

            // Build provider options
            const providerOptions: Record<string, unknown> = {}
            if (transformedParams.thinkingBudget != null) {
                providerOptions.anthropic = {
                    thinking: {
                        type: 'enabled',
                        budgetTokens: transformedParams.thinkingBudget,
                    },
                }
            }

            // For non-Claude models via Anthropic provider, SDK defaults to 4096 max_tokens
            // which is too low when the model returns thinking content (e.g. MiniMax)
            const isClaude = model.modelId.startsWith('claude')
            const NON_CLAUDE_DEFAULT_MAX_TOKENS = 131072
            const resolvedMaxTokens =
                transformedParams.maxTokens ??
                (isClaude ? undefined : NON_CLAUDE_DEFAULT_MAX_TOKENS)

            // Call streamText (returns synchronously)
            const streamResult = streamText({
                model,
                system: systemPrompt || undefined,
                messages: modelMessages,
                tools: aiTools,
                stopWhen: stepCountIs(transformedParams.maxSteps),
                temperature: transformedParams.temperature,
                ...(resolvedMaxTokens != null
                    ? { maxOutputTokens: resolvedMaxTokens }
                    : {}),
                ...(Object.keys(providerOptions).length > 0
                    ? { providerOptions }
                    : {}),
            })

            // Finalization guard
            let finalized = false

            // Cached finalized data — resolved once, reused
            let finalizedData: {
                text: string
                usage: FinishedResult['usage']
                toolCalls: ToolCallRecord[]
            } | null = null

            async function resolveFinalizedData() {
                if (finalizedData) return finalizedData
                const [text, usage, steps] = await Promise.all([
                    streamResult.text,
                    streamResult.usage,
                    streamResult.steps,
                ])
                const toolCalls = extractToolCalls(steps)
                finalizedData = {
                    text,
                    usage: {
                        inputTokens: usage.inputTokens,
                        outputTokens: usage.outputTokens,
                    },
                    toolCalls,
                }
                return finalizedData
            }

            async function finalize(responseMessage: UIMessage): Promise<void> {
                if (finalized) return
                finalized = true

                const { text, usage, toolCalls } = await resolveFinalizedData()

                const afterCtx: AfterChatContext = {
                    ...hookCtx,
                    result: { text, usage, toolCalls, reasoning: undefined },
                    responseMessage,
                    toolCalls,
                }

                await runAfterChatHooks(plugins, afterCtx)
            }

            async function consumeStream(): Promise<ConsumedResult> {
                let capturedResponseMessage: UIMessage | null = null

                const uiStream = streamResult.toUIMessageStream({
                    sendReasoning: true,
                    onFinish: ({ responseMessage }) => {
                        capturedResponseMessage = responseMessage
                    },
                })

                // Drain the stream
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

                // finalize triggers afterChat hooks; resolveFinalizedData caches the result
                await finalize(capturedResponseMessage)
                const { text, usage, toolCalls } = await resolveFinalizedData()

                return {
                    text,
                    responseMessage: capturedResponseMessage,
                    toolCalls,
                    usage,
                }
            }

            return {
                streamResult,
                sessionId: hookCtx.sessionId,
                consumeStream,
                finalize,
            }
        } catch (error) {
            const err =
                error instanceof Error ? error : new Error(String(error))
            await runOnErrorHooks(plugins, hookCtx, err)
            throw error
        }
    }

    // ── getToolDisplayMap() ──

    function getToolDisplayMap(): ToolDisplayMap {
        return { ...staticDisplayMap }
    }

    // ── dispose() ──

    async function dispose(): Promise<void> {
        await Promise.allSettled(
            plugins.map(async (plugin) => {
                if (plugin.destroy != null) {
                    try {
                        await plugin.destroy()
                    } catch (error) {
                        console.error(
                            `[${plugin.name}] destroy() failed:`,
                            error,
                        )
                    }
                }
            }),
        )
    }

    return { chat, getToolDisplayMap, dispose }
}
