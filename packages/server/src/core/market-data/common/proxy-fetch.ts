/**
 * Proxy-aware fetch using undici
 *
 * Next.js patches globalThis.fetch, breaking Bun's native proxy detection.
 * This module provides a fetch function that uses undici's ProxyAgent
 * when HTTPS_PROXY/HTTP_PROXY environment variables are set.
 *
 * When no proxy is configured, falls back to globalThis.fetch so that
 * unit tests can mock it normally.
 *
 * Used by: yahoo-client.ts, finnhub-client.ts
 */

import { ProxyAgent, fetch as undiciFetch } from 'undici'

// Lazy-initialized dispatcher — reads env at first call, not at module load.
// This ensures dotenv/preload has time to populate HTTPS_PROXY before use.
let dispatcher: ProxyAgent | undefined
let initialized = false

function getDispatcher(): ProxyAgent | undefined {
    if (!initialized) {
        const proxyUrl =
            process.env.HTTPS_PROXY ||
            process.env.HTTP_PROXY ||
            process.env.https_proxy ||
            process.env.http_proxy
        dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined
        initialized = true
    }
    return dispatcher
}

/**
 * Fetch with proxy support via undici.
 * When proxy env vars are set, uses undici + ProxyAgent.
 * Otherwise, uses globalThis.fetch (allows normal test mocking).
 */
export async function proxyFetch(
    url: string | URL,
    init?: RequestInit,
): Promise<Response> {
    const d = getDispatcher()
    if (d) {
        // undici's RequestInit has a wider `body` type than the global RequestInit,
        // making them structurally incompatible. Cast through `any` since both
        // shapes are semantically equivalent for our usage.
        return undiciFetch(url.toString(), {
            ...(init as unknown as NonNullable<
                Parameters<typeof undiciFetch>[1]
            >),
            dispatcher: d,
        }) as unknown as Response
    }
    return init
        ? globalThis.fetch(url.toString(), init)
        : globalThis.fetch(url.toString())
}
