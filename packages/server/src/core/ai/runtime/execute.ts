import { InvalidPluginOutputError, PluginError } from './errors'
import type {
    AfterRunContext,
    AIPlugin,
    ChatParams,
    PluginOutput,
    RunContext,
} from './types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Object.prototype.toString.call(value) === '[object Object]'
}

const ALLOWED_SEGMENT_TARGETS = new Set(['system', 'messages'] as const)
const ALLOWED_SEGMENT_KINDS = new Set([
    'system.base',
    'system.instructions',
    'memory.long_lived',
    'history.recent',
    'live.runtime',
] as const)
const ALLOWED_SEGMENT_PRIORITIES = new Set([
    'required',
    'high',
    'medium',
    'low',
] as const)
const ALLOWED_SEGMENT_CACHEABILITY = new Set([
    'stable',
    'session',
    'volatile',
    'none',
] as const)
const ALLOWED_SEGMENT_COMPACTABILITY = new Set([
    'preserve',
    'summarize',
    'trim',
] as const)
const ALLOWED_DIAGNOSTIC_LEVELS = new Set([
    'debug',
    'info',
    'warn',
    'error',
] as const)
const ALLOWED_PLUGIN_OUTPUT_KEYS = new Set([
    'segments',
    'tools',
    'params',
    'diagnostics',
] as const)
const ALLOWED_CHAT_PARAM_KEYS = new Set<keyof ChatParams>([
    'maxSteps',
    'temperature',
    'thinkingBudget',
    'maxTokens',
])
const ALLOWED_MESSAGE_ROLES = new Set(['system', 'user', 'assistant'] as const)

function failInvalidPluginOutput(pluginName: string, reason: string): never {
    throw new InvalidPluginOutputError(pluginName, reason)
}

function expectPlainObject(
    pluginName: string,
    value: unknown,
    path: string,
): asserts value is Record<string, unknown> {
    if (!isPlainObject(value)) {
        failInvalidPluginOutput(pluginName, `${path} must be an object`)
    }
}

function expectArray(
    pluginName: string,
    value: unknown,
    path: string,
): asserts value is unknown[] {
    if (!Array.isArray(value)) {
        failInvalidPluginOutput(pluginName, `${path} must be an array`)
    }
}

function expectString(
    pluginName: string,
    value: unknown,
    path: string,
): asserts value is string {
    if (typeof value !== 'string') {
        failInvalidPluginOutput(pluginName, `${path} must be a string`)
    }
}

function expectFunction(
    pluginName: string,
    value: unknown,
    path: string,
): asserts value is (...args: never[]) => unknown {
    if (typeof value !== 'function') {
        failInvalidPluginOutput(pluginName, `${path} must be a function`)
    }
}

function expectAllowedString(
    pluginName: string,
    value: unknown,
    path: string,
    allowed: ReadonlySet<string>,
): asserts value is string {
    if (typeof value !== 'string' || !allowed.has(value)) {
        failInvalidPluginOutput(
            pluginName,
            `${path} must be one of ${Array.from(allowed).join(', ')}`,
        )
    }
}

function expectKnownKeys(
    pluginName: string,
    value: Record<string, unknown>,
    path: string,
    allowed: ReadonlySet<string>,
): void {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            failInvalidPluginOutput(
                pluginName,
                `${path}.${key} is not supported`,
            )
        }
    }
}

function expectPositiveInteger(
    pluginName: string,
    value: number,
    path: string,
): void {
    if (!Number.isInteger(value) || value <= 0) {
        failInvalidPluginOutput(
            pluginName,
            `${path} must be a positive integer`,
        )
    }
}

function validateUIMessage(
    pluginName: string,
    message: unknown,
    path: string,
): asserts message is Record<string, unknown> {
    expectPlainObject(pluginName, message, path)
    expectString(pluginName, message.id, `${path}.id`)
    expectAllowedString(
        pluginName,
        message.role,
        `${path}.role`,
        ALLOWED_MESSAGE_ROLES,
    )
    expectArray(pluginName, message.parts, `${path}.parts`)

    for (const [partIndex, part] of message.parts.entries()) {
        expectPlainObject(pluginName, part, `${path}.parts[${partIndex}]`)
        expectString(pluginName, part.type, `${path}.parts[${partIndex}].type`)
    }
}

function validateContextSegment(
    pluginName: string,
    segment: unknown,
    index: number,
): asserts segment is Record<string, unknown> {
    const path = `segments[${index}]`
    expectPlainObject(pluginName, segment, path)
    expectString(pluginName, segment.id, `${path}.id`)
    expectAllowedString(
        pluginName,
        segment.target,
        `${path}.target`,
        ALLOWED_SEGMENT_TARGETS,
    )
    expectAllowedString(
        pluginName,
        segment.kind,
        `${path}.kind`,
        ALLOWED_SEGMENT_KINDS,
    )
    expectPlainObject(pluginName, segment.payload, `${path}.payload`)
    expectPlainObject(pluginName, segment.source, `${path}.source`)
    expectString(pluginName, segment.source.plugin, `${path}.source.plugin`)
    if ('origin' in segment.source && segment.source.origin !== undefined) {
        expectString(pluginName, segment.source.origin, `${path}.source.origin`)
    }
    expectAllowedString(
        pluginName,
        segment.priority,
        `${path}.priority`,
        ALLOWED_SEGMENT_PRIORITIES,
    )
    expectAllowedString(
        pluginName,
        segment.cacheability,
        `${path}.cacheability`,
        ALLOWED_SEGMENT_CACHEABILITY,
    )
    expectAllowedString(
        pluginName,
        segment.compactability,
        `${path}.compactability`,
        ALLOWED_SEGMENT_COMPACTABILITY,
    )

    if (segment.target === 'system') {
        if (segment.payload.format !== 'text') {
            failInvalidPluginOutput(
                pluginName,
                `${path}.payload.format must be "text" for system segments`,
            )
        }
        expectString(pluginName, segment.payload.text, `${path}.payload.text`)
        return
    }

    if (segment.payload.format !== 'messages') {
        failInvalidPluginOutput(
            pluginName,
            `${path}.payload.format must be "messages" for message segments`,
        )
    }
    expectArray(
        pluginName,
        segment.payload.messages,
        `${path}.payload.messages`,
    )
    for (const [messageIndex, message] of segment.payload.messages.entries()) {
        validateUIMessage(
            pluginName,
            message,
            `${path}.payload.messages[${messageIndex}]`,
        )
    }
}

function validateToolContribution(
    pluginName: string,
    tool: unknown,
    index: number,
): asserts tool is Record<string, unknown> {
    const path = `tools[${index}]`
    expectPlainObject(pluginName, tool, path)
    expectString(pluginName, tool.name, `${path}.name`)
    expectPlainObject(pluginName, tool.definition, `${path}.definition`)
    expectPlainObject(
        pluginName,
        tool.definition.tool,
        `${path}.definition.tool`,
    )

    if ('display' in tool.definition && tool.definition.display !== undefined) {
        expectPlainObject(
            pluginName,
            tool.definition.display,
            `${path}.definition.display`,
        )
        expectFunction(
            pluginName,
            tool.definition.display.loadingLabel,
            `${path}.definition.display.loadingLabel`,
        )
        expectFunction(
            pluginName,
            tool.definition.display.completionSummary,
            `${path}.definition.display.completionSummary`,
        )
        expectAllowedString(
            pluginName,
            tool.definition.display.category,
            `${path}.definition.display.category`,
            new Set(['data', 'display', 'memory', 'trading', 'research']),
        )
    }

    expectString(pluginName, tool.source, `${path}.source`)
    expectPlainObject(pluginName, tool.manifestSpec, `${path}.manifestSpec`)

    if (
        'description' in tool.manifestSpec &&
        tool.manifestSpec.description !== undefined
    ) {
        expectString(
            pluginName,
            tool.manifestSpec.description,
            `${path}.manifestSpec.description`,
        )
    }
}

function validateDiagnostic(
    pluginName: string,
    diagnostic: unknown,
    index: number,
): asserts diagnostic is Record<string, unknown> {
    const path = `diagnostics[${index}]`
    expectPlainObject(pluginName, diagnostic, path)
    expectString(pluginName, diagnostic.plugin, `${path}.plugin`)
    expectAllowedString(
        pluginName,
        diagnostic.level,
        `${path}.level`,
        ALLOWED_DIAGNOSTIC_LEVELS,
    )
    expectString(pluginName, diagnostic.message, `${path}.message`)
    if ('origin' in diagnostic && diagnostic.origin !== undefined) {
        expectString(pluginName, diagnostic.origin, `${path}.origin`)
    }
}

function validateParams(
    pluginName: string,
    params: unknown,
): asserts params is Record<string, unknown> {
    expectPlainObject(pluginName, params, 'params')

    for (const [key, value] of Object.entries(params)) {
        if (!ALLOWED_CHAT_PARAM_KEYS.has(key as keyof ChatParams)) {
            failInvalidPluginOutput(
                pluginName,
                `params.${key} is not supported`,
            )
        }

        if (value === undefined) continue
        if (typeof value !== 'number') {
            failInvalidPluginOutput(
                pluginName,
                `params.${key} must be a number`,
            )
        }
        if (!Number.isFinite(value)) {
            failInvalidPluginOutput(
                pluginName,
                `params.${key} must be a finite number`,
            )
        }

        if (
            key === 'maxSteps' ||
            key === 'thinkingBudget' ||
            key === 'maxTokens'
        ) {
            expectPositiveInteger(pluginName, value, `params.${key}`)
        }
    }
}

function validatePluginOutput(
    pluginName: string,
    output: unknown,
): asserts output is PluginOutput {
    if (output == null) {
        throw new InvalidPluginOutputError(
            pluginName,
            'contribute() returned null or undefined',
        )
    }

    if (!isPlainObject(output)) {
        throw new InvalidPluginOutputError(
            pluginName,
            'contribute() must return an object',
        )
    }
    expectKnownKeys(pluginName, output, 'output', ALLOWED_PLUGIN_OUTPUT_KEYS)

    if ('segments' in output && output.segments !== undefined) {
        expectArray(pluginName, output.segments, 'segments')
        for (const [index, segment] of output.segments.entries()) {
            validateContextSegment(pluginName, segment, index)
        }
    }

    if ('tools' in output && output.tools !== undefined) {
        expectArray(pluginName, output.tools, 'tools')
        for (const [index, tool] of output.tools.entries()) {
            validateToolContribution(pluginName, tool, index)
        }
    }

    if ('params' in output && output.params !== undefined) {
        validateParams(pluginName, output.params)
    }

    if ('diagnostics' in output && output.diagnostics !== undefined) {
        expectArray(pluginName, output.diagnostics, 'diagnostics')
        for (const [index, diagnostic] of output.diagnostics.entries()) {
            validateDiagnostic(pluginName, diagnostic, index)
        }
    }
}

/**
 * Run beforeRun hooks (serial, side-effect). Errors propagate.
 */
export async function runBeforeRunHooks(
    plugins: AIPlugin[],
    ctx: RunContext,
): Promise<void> {
    for (const plugin of plugins) {
        if (plugin.beforeRun == null) continue
        try {
            await plugin.beforeRun(ctx)
        } catch (error) {
            throw new PluginError(plugin.name, 'beforeRun', error)
        }
    }
}

/**
 * Collect contribute() outputs in plugin order.
 * Each output is labeled with the owning plugin name for deterministic assembly.
 */
export async function collectPluginOutputs(
    plugins: AIPlugin[],
    ctx: RunContext,
): Promise<Array<{ plugin: string; output: PluginOutput }>> {
    return await new Promise((resolve, reject) => {
        const outputs = new Array<{
            plugin: string
            output: PluginOutput
        } | null>(plugins.length).fill(null)
        let remaining = 0
        let settled = false

        const maybeResolve = () => {
            if (!settled && remaining === 0) {
                settled = true
                resolve(
                    outputs.filter(
                        (
                            output,
                        ): output is { plugin: string; output: PluginOutput } =>
                            output != null,
                    ),
                )
            }
        }

        for (const [index, plugin] of plugins.entries()) {
            if (plugin.contribute == null) continue
            remaining++

            Promise.resolve()
                .then(() => plugin.contribute?.(ctx))
                .then((output) => {
                    validatePluginOutput(plugin.name, output)
                    if (settled) return

                    outputs[index] = { plugin: plugin.name, output }
                    remaining--
                    maybeResolve()
                })
                .catch((error) => {
                    if (settled) return
                    settled = true
                    reject(
                        error instanceof InvalidPluginOutputError
                            ? error
                            : new PluginError(plugin.name, 'contribute', error),
                    )
                })
        }

        maybeResolve()
    })
}

/**
 * Run afterRun hooks (parallel, best-effort). Failures are swallowed.
 */
export async function runAfterRunHooks(
    plugins: AIPlugin[],
    ctx: AfterRunContext,
): Promise<void> {
    await Promise.allSettled(
        plugins
            .filter((p) => p.afterRun != null)
            .map(async (p) => {
                try {
                    await p.afterRun?.(ctx)
                } catch (error) {
                    console.error(`[${p.name}] afterRun failed:`, error)
                }
            }),
    )
}

/**
 * Run onError hooks (parallel, best-effort). Failures are swallowed.
 */
export async function runOnErrorHooks(
    plugins: AIPlugin[],
    ctx: RunContext,
    error: Error,
): Promise<void> {
    await Promise.allSettled(
        plugins
            .filter((p) => p.onError != null)
            .map(async (p) => {
                try {
                    await p.onError?.(ctx, error)
                } catch (hookError) {
                    console.error(`[${p.name}] onError failed:`, hookError)
                }
            }),
    )
}
