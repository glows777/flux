/**
 * Shared SWR fetcher that auto-unwraps the { success, data, error } API envelope.
 * Usage: const { data } = useSWR<MacroTicker[]>('/api/macro', fetcher)
 *
 * In dev, Next.js rewrites /api/* to the standalone server via next.config.ts.
 * No cross-origin needed — all requests are same-origin.
 */
export async function fetcher<T>(url: string): Promise<T> {
    const res = await fetch(url)
    if (!res.ok) {
        throw new Error(`API error: ${res.status}`)
    }
    const json = await res.json()
    if (!json.success) {
        throw new Error(json.error ?? 'Unknown error')
    }
    return json.data as T
}
