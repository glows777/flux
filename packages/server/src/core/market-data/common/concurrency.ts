/**
 * Limits the number of concurrent external API requests
 * to prevent cold-start thundering herd.
 */
export class ConcurrencyLimiter {
    private running = 0
    private readonly queue: Array<() => void> = []

    constructor(private readonly maxConcurrent: number) {}

    async run<T>(fn: () => Promise<T>): Promise<T> {
        if (this.running >= this.maxConcurrent) {
            await new Promise<void>((resolve) => this.queue.push(resolve))
        }
        this.running++
        try {
            return await fn()
        } finally {
            this.running--
            this.queue.shift()?.()
        }
    }
}
