import { GlobalRegistrator } from '@happy-dom/global-registrator'
import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'bun:test'

// Pre-import lucide-react to cache its ESM resolution before test files load.
// Without this, bun's CJS/ESM interop fails on named exports in the full suite.
import 'lucide-react'

// 注册 happy-dom 全局变量 (window, document, etc.)
GlobalRegistrator.register()

// 扩展 bun:test 的 expect
expect.extend(matchers)

// 清除代理环境变量，确保单元测试中 proxyFetch 回退到 globalThis.fetch
// （使得 globalThis.fetch mock 正常工作）
delete process.env.HTTPS_PROXY
delete process.env.HTTP_PROXY
delete process.env.https_proxy
delete process.env.http_proxy
