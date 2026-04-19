import type {
    AfterRunContext,
    AssembledContextSnapshot,
    ContextManifest,
    ManifestInputSnapshot,
    ModelRequestSnapshot,
    PluginOutput,
    PluginOutputSnapshot,
    ResultSnapshot,
    RunContext,
} from './types'

function nowIso(): string {
    return new Date().toISOString()
}

function createRunId(): string {
    // Deterministic uniqueness isn't required here; it's a runtime trace identifier.
    return `run_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

export function createBaseManifest(input: {
    ctx: RunContext
    defaults: Record<string, unknown>
    initialSessionId?: string
    resolvedSessionId?: string
    assembledContext: AssembledContextSnapshot
    modelRequest: ModelRequestSnapshot
}): ContextManifest {
    const inputSnapshot: ManifestInputSnapshot = {
        channel: input.ctx.channel,
        mode: input.ctx.mode,
        agentType: input.ctx.agentType,
        rawMessages: input.ctx.rawMessages,
        ...(input.initialSessionId != null
            ? { initialSessionId: input.initialSessionId }
            : {}),
        ...(input.resolvedSessionId != null
            ? { resolvedSessionId: input.resolvedSessionId }
            : {}),
        defaults: input.defaults,
    }

    return {
        runId: createRunId(),
        createdAt: nowIso(),
        input: inputSnapshot,
        pluginOutputs: [],
        assembledContext: input.assembledContext,
        modelRequest: input.modelRequest,
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

