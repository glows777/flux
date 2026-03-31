/**
 * E2E Test App
 *
 * Creates a shared Hono app instance and request helpers.
 * IMPORTANT: mock-boundaries.ts must be imported BEFORE this file.
 */

import { createHonoApp } from '@/routes/index'

export function createTestApp() {
    return createHonoApp()
}

type TestApp = ReturnType<typeof createTestApp>

export async function jsonGet(app: TestApp, path: string) {
    return app.request(path)
}

export async function jsonPost(
    app: TestApp,
    path: string,
    body?: Record<string, unknown>,
) {
    if (body !== undefined) {
        return app.request(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
    }
    return app.request(path, { method: 'POST' })
}

export async function jsonDelete(app: TestApp, path: string) {
    return app.request(path, { method: 'DELETE' })
}
