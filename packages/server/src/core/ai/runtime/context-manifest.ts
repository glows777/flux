import type {
    AfterRunContext,
    AssembledContextSnapshot,
    ChatInput,
    ContextManifest,
    ModelRequestSnapshot,
    PluginOutput,
    PluginOutputSnapshot,
    ResultSnapshot,
} from './types'

export function createBaseManifest(params: {
    runId: string
    input: ChatInput
    resolvedSessionId?: string
    defaults: Record<string, unknown>
}): ContextManifest {
    return {
        runId: params.runId,
        createdAt: new Date().toISOString(),
        input: {
            channel: params.input.channel,
            mode: params.input.mode,
            agentType: params.input.agentType ?? 'trading-agent',
            rawMessages: params.input.messages,
            initialSessionId: params.input.sessionId,
            resolvedSessionId: params.resolvedSessionId,
            defaults: params.defaults,
        },
        pluginOutputs: [],
        assembledContext: {
            segments: [],
            tools: [],
            params: { candidates: [], resolved: {} },
            totalEstimatedInputTokens: 0,
        },
        modelRequest: {
            systemText: '',
            modelMessages: [],
            toolNames: [],
            resolvedParams: {},
            providerOptions: {},
        },
    }
}

export function attachPluginOutputsSnapshot(
    manifest: ContextManifest,
    outputs: Array<{ plugin: string; output: PluginOutput }>,
): ContextManifest {
    const pluginOutputs: PluginOutputSnapshot[] = outputs.map((o) => ({
        plugin: o.plugin,
        output: o.output,
    }))

    return { ...manifest, pluginOutputs }
}

export function attachAssembledContextSnapshot(
    manifest: ContextManifest,
    snapshot: AssembledContextSnapshot,
): ContextManifest {
    return { ...manifest, assembledContext: snapshot }
}

export function attachModelRequestSnapshot(
    manifest: ContextManifest,
    snapshot: ModelRequestSnapshot,
): ContextManifest {
    return { ...manifest, modelRequest: snapshot }
}

export function attachResultSnapshot(
    manifest: ContextManifest,
    ctx: Pick<
        AfterRunContext,
        'text' | 'responseMessage' | 'toolCalls' | 'usage'
    >,
): ContextManifest {
    const result: ResultSnapshot = {
        text: ctx.text,
        responseMessage: ctx.responseMessage,
        toolCalls: ctx.toolCalls,
        usage: ctx.usage,
    }

    return { ...manifest, result }
}

