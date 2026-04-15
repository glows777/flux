/**
 * Per-tool configurable timeout utility.
 *
 * Wraps a Promise with a deadline — if it doesn't settle within `ms`,
 * the returned Promise rejects with a descriptive Error.
 */

export function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error(`${label} timed out after ${ms}ms`)),
                ms,
            ),
        ),
    ])
}
