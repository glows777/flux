/**
 * FallbackChain — tries providers in order, with optional circuit breaker.
 *
 * Each provider is attempted sequentially; on failure or timeout the next
 * provider is tried.  An optional circuit breaker skips providers that have
 * failed consecutively beyond a threshold, re-probing after a cooldown.
 */

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface DataSourceProvider<T> {
    readonly name: string
    readonly fetch: (key: string, ...args: unknown[]) => Promise<T>
    readonly timeout: number // ms
}

export interface FallbackChainOptions {
    readonly circuitBreaker?: {
        readonly failureThreshold: number // consecutive failures to trip (default 3)
        readonly cooldownMs: number // how long to skip tripped provider (default 30_000)
    }
}

// ---------------------------------------------------------------------------
// CircuitBreaker (internal)
// ---------------------------------------------------------------------------

enum BreakerState {
    Closed = 'CLOSED',
    Open = 'OPEN',
    HalfOpen = 'HALF_OPEN',
}

class CircuitBreaker {
    private consecutiveFailures = 0
    private lastFailureAt = 0
    private readonly failureThreshold: number
    private readonly cooldownMs: number

    constructor(failureThreshold: number, cooldownMs: number) {
        this.failureThreshold = failureThreshold
        this.cooldownMs = cooldownMs
    }

    private get state(): BreakerState {
        if (this.consecutiveFailures < this.failureThreshold) {
            return BreakerState.Closed
        }
        const elapsed = Date.now() - this.lastFailureAt
        if (elapsed >= this.cooldownMs) {
            return BreakerState.HalfOpen
        }
        return BreakerState.Open
    }

    isOpen(): boolean {
        return this.state === BreakerState.Open
    }

    recordSuccess(): void {
        this.consecutiveFailures = 0
    }

    recordFailure(): void {
        this.consecutiveFailures += 1
        this.lastFailureAt = Date.now()
    }
}

// ---------------------------------------------------------------------------
// FallbackChain
// ---------------------------------------------------------------------------

export class FallbackChain<T> {
    private readonly providers: ReadonlyArray<DataSourceProvider<T>>
    private readonly breakers: ReadonlyMap<string, CircuitBreaker>

    constructor(
        providers: ReadonlyArray<DataSourceProvider<T>>,
        options?: FallbackChainOptions,
    ) {
        this.providers = providers

        const breakerMap = new Map<string, CircuitBreaker>()
        if (options?.circuitBreaker) {
            const { failureThreshold, cooldownMs } = options.circuitBreaker
            for (const provider of providers) {
                breakerMap.set(
                    provider.name,
                    new CircuitBreaker(failureThreshold, cooldownMs),
                )
            }
        }
        this.breakers = breakerMap
    }

    async execute(key: string, ...args: unknown[]): Promise<T> {
        let lastError: Error | undefined

        for (const provider of this.providers) {
            const breaker = this.breakers.get(provider.name)

            // Skip providers with an open circuit breaker
            if (breaker?.isOpen()) {
                continue
            }

            try {
                const result = await this.raceTimeout(provider, key, args)
                breaker?.recordSuccess()
                return result
            } catch (error) {
                lastError =
                    error instanceof Error ? error : new Error(String(error))
                breaker?.recordFailure()
            }
        }

        throw new Error(`All providers failed for key "${key}"`, {
            cause: lastError,
        })
    }

    private raceTimeout(
        provider: DataSourceProvider<T>,
        key: string,
        args: unknown[],
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let settled = false

            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true
                    reject(
                        new Error(
                            `Provider "${provider.name}" timed out after ${provider.timeout}ms`,
                        ),
                    )
                }
            }, provider.timeout)

            provider
                .fetch(key, ...args)
                .then((value) => {
                    if (!settled) {
                        settled = true
                        clearTimeout(timer)
                        resolve(value)
                    }
                })
                .catch((err) => {
                    if (!settled) {
                        settled = true
                        clearTimeout(timer)
                        reject(err)
                    }
                })
        })
    }
}
