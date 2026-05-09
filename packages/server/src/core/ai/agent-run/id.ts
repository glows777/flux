export function createRunId(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return crypto.randomUUID()
    }

    return `run_${Math.random().toString(16).slice(2)}_${Date.now()}`
}
