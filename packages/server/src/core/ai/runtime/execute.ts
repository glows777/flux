import { PluginError, ToolConflictError } from './errors'
import type { AfterChatContext, AIPlugin, HookContext, ToolMap } from './types'

/**
 * Run beforeChat hooks (serial, side-effect). Errors propagate.
 * Plugins can mutate ctx (e.g., set sessionId via ctx.meta).
 */
export async function runBeforeChatHooks(
    plugins: AIPlugin[],
    ctx: HookContext,
): Promise<void> {
    for (const plugin of plugins) {
        if (plugin.beforeChat == null) continue
        try {
            await plugin.beforeChat(ctx)
        } catch (error) {
            throw new PluginError(plugin.name, 'beforeChat', error)
        }
    }
}

export async function collectSystemPrompts(
    plugins: AIPlugin[],
    ctx: HookContext,
): Promise<string> {
    const fragments = await Promise.all(
        plugins.map(async (plugin) => {
            if (plugin.systemPrompt == null) return null
            try {
                return typeof plugin.systemPrompt === 'function'
                    ? await plugin.systemPrompt(ctx)
                    : plugin.systemPrompt
            } catch (error) {
                throw new PluginError(plugin.name, 'systemPrompt', error)
            }
        }),
    )
    return fragments
        .filter((f): f is string => f != null && f.length > 0)
        .join('\n\n')
}

export async function collectTools(
    plugins: AIPlugin[],
    ctx: HookContext,
): Promise<ToolMap> {
    const pluginToolPairs = await Promise.all(
        plugins.map(async (plugin) => {
            if (plugin.tools == null)
                return { name: plugin.name, tools: {} as ToolMap }
            try {
                const tools =
                    typeof plugin.tools === 'function'
                        ? await plugin.tools(ctx)
                        : plugin.tools
                return { name: plugin.name, tools }
            } catch (error) {
                throw new PluginError(plugin.name, 'tools', error)
            }
        }),
    )

    const merged: ToolMap = {}
    const ownership: Record<string, string> = {}

    for (const { name, tools } of pluginToolPairs) {
        for (const [toolName, def] of Object.entries(tools)) {
            if (ownership[toolName] != null) {
                throw new ToolConflictError(toolName, ownership[toolName], name)
            }
            ownership[toolName] = name
            merged[toolName] = def
        }
    }

    return merged
}

export async function runTransformChain<T>(
    plugins: AIPlugin[],
    hookName: 'transformMessages' | 'transformParams',
    ctx: HookContext,
    initial: T,
): Promise<T> {
    let current = initial
    for (const plugin of plugins) {
        const hook = plugin[hookName] as
            | ((ctx: HookContext, value: T) => T | Promise<T>)
            | undefined
        if (hook == null) continue
        try {
            current = await hook(ctx, current)
        } catch (error) {
            throw new PluginError(plugin.name, hookName, error)
        }
    }
    return current
}

export async function runAfterChatHooks(
    plugins: AIPlugin[],
    ctx: AfterChatContext,
): Promise<void> {
    await Promise.allSettled(
        plugins
            .filter((p) => p.afterChat != null)
            .map(async (p) => {
                try {
                    await p.afterChat?.(ctx)
                } catch (error) {
                    console.error(`[${p.name}] afterChat failed:`, error)
                }
            }),
    )
}

export async function runOnErrorHooks(
    plugins: AIPlugin[],
    ctx: HookContext,
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
