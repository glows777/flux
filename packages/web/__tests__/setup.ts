import { GlobalRegistrator } from '@happy-dom/global-registrator'
import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'bun:test'

// Pre-import lucide-react to cache its ESM resolution before test files load.
// Without this, bun's CJS/ESM interop fails on named exports in the full suite.
import 'lucide-react'

// Register happy-dom globals (window, document, etc.)
GlobalRegistrator.register()

// Extend bun:test's expect
expect.extend(matchers)
