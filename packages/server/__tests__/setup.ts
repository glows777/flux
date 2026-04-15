/**
 * Server package test setup (preload file for unit tests).
 *
 * Mirrors root test-setup.ts behavior for the server package.
 * Requires @happy-dom/global-registrator and @testing-library/jest-dom
 * to be available (install as devDependencies if running standalone).
 */

import { expect } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import * as matchers from '@testing-library/jest-dom/matchers'

// Register happy-dom globals (window, document, etc.)
GlobalRegistrator.register()

// Extend bun:test's expect
expect.extend(matchers)

// Set a dummy DATABASE_URL for unit tests that import db.ts transitively
// (actual DB connection is never used in unit tests — only in integration/e2e)
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
        'postgresql://test:test@localhost:5433/flux_test?schema=public'
}

// Clear proxy env vars so proxyFetch falls back to globalThis.fetch
// (allowing globalThis.fetch mocks to work in unit tests)
delete process.env.HTTPS_PROXY
delete process.env.HTTP_PROXY
delete process.env.https_proxy
delete process.env.http_proxy
