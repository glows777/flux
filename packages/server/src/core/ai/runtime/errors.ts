export class PluginError extends Error {
    constructor(
        public readonly pluginName: string,
        public readonly hookName: string,
        public override readonly cause: unknown,
    ) {
        super(`Plugin "${pluginName}" failed in hook "${hookName}": ${cause}`)
        this.name = 'PluginError'
    }
}

export class ToolConflictError extends Error {
    constructor(
        public readonly toolName: string,
        public readonly pluginA: string,
        public readonly pluginB: string,
    ) {
        super(
            `Tool "${toolName}" registered by both "${pluginA}" and "${pluginB}". Tool names must be unique across all plugins.`,
        )
        this.name = 'ToolConflictError'
    }
}
