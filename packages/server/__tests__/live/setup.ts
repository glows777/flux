/**
 * Live test setup — undo bunfig.toml preload side-effects.
 *
 * bunfig.toml preload (test-setup.ts) does two things that break live tests:
 * 1. Registers happy-dom → adds XMLHttpRequest, causing Axios to pick
 *    the xhr adapter (which can't make real HTTP requests)
 * 2. Deletes HTTPS_PROXY/HTTP_PROXY → proxyFetch falls back to globalThis.fetch
 *
 * This setup undoes both so live tests can make real HTTP requests.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { config } from 'dotenv'

// Undo happy-dom global registration
try {
    GlobalRegistrator.unregister()
} catch {
    // May already be unregistered
}

// Force-remove XMLHttpRequest even if unregister() didn't clean it up.
// Without this, Axios selects the xhr adapter (happy-dom's XHR can't do real HTTP).
// With it removed, Axios falls through to the http adapter (Node.js) which works.
// biome-ignore lint: intentional global cleanup
delete (globalThis as any).XMLHttpRequest

// Restore env vars from .env (test-setup.ts deletes proxy vars)
config()

// Force direct network — remove proxy env vars so proxyFetch falls back
// to globalThis.fetch and Axios (Tavily SDK) connects directly.
delete process.env.HTTPS_PROXY
delete process.env.HTTP_PROXY
delete process.env.https_proxy
delete process.env.http_proxy
