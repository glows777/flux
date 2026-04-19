import { PluginError } from './errors'
import type {
    AfterRunContext,
    AIPlugin,
    PluginOutput,
    RunContext,
} from './types'

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
    const pairs = await Promise.all(
        plugins.map(async (plugin) => {
            if (plugin.contribute == null) return null
            try {
                const output = await plugin.contribute(ctx)
                return { plugin: plugin.name, output }
            } catch (error) {
                throw new PluginError(plugin.name, 'contribute', error)
            }
        }),
    )

    return pairs.filter(
        (pair): pair is { plugin: string; output: PluginOutput } => pair != null,
    )
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

