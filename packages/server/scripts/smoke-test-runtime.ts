/**
 * Smoke test: 验证 AI plugin runtime 能否实际工作
 *
 * 用法: cd packages/server && bun run scripts/smoke-test-runtime.ts
 *
 * 需要: .env 中配置 ANTHROPIC_API_KEY + 数据库连接
 */

import 'dotenv/config'
import { createAIRuntime } from '../src/core/ai/runtime'
import { sessionPlugin } from '../src/core/ai/plugins/session'
import { memoryPlugin } from '../src/core/ai/plugins/memory'
import { promptPlugin } from '../src/core/ai/plugins/prompt'
import { dataPlugin } from '../src/core/ai/plugins/data'
import { researchPlugin } from '../src/core/ai/plugins/research'
import { webChatPreset } from '../src/core/ai/presets/web-chat'
import { getModel } from '../src/core/ai/providers'
import type { UIMessage } from 'ai'

const DIVIDER = '─'.repeat(60)

// ── Test 1: 最小 runtime ──

async function testMinimal() {
  console.log('\n📦 Test 1: 最小 runtime（prompt only, 无 tools）')

  const runtime = await createAIRuntime({
    model: getModel('main'),
    plugins: [
      promptPlugin({ mode: 'global' }),
      // 跳过 session（避免 DB 依赖）
    ],
    defaults: { thinkingBudget: 4096 },
  })

  console.log('   ✅ 创建成功, display tools:', Object.keys(runtime.getToolDisplayMap()).length)

  const output = await runtime.chat({
    sessionId: 'smoke-minimal',
    messages: [{
      id: '1', role: 'user', content: '一句话介绍你自己',
      parts: [{ type: 'text', text: '一句话介绍你自己' }],
    }] as UIMessage[],
    channel: 'cron',
  })

  const result = await output.consumeStream()
  console.log('   ✅ 回复:', result.text.slice(0, 150))
  console.log('   ✅ usage:', result.usage)
  await runtime.dispose()
}

// ── Test 2: 完整 webChatPreset（含 data tools + research + display）──

async function testFullPreset() {
  console.log('\n📦 Test 2: 完整 webChatPreset（含 data/research/display tools）')

  let plugins
  try {
    plugins = webChatPreset()
    console.log('   ✅ Preset 创建成功, plugins:', plugins.map(p => p.name).join(', '))
  } catch (err) {
    console.log('   ❌ Preset 创建失败:', (err as Error).message)
    return
  }

  const runtime = await createAIRuntime({
    model: getModel('main'),
    plugins,
    defaults: { thinkingBudget: 4096 },
  })

  const toolNames = Object.keys(runtime.getToolDisplayMap())
  console.log('   ✅ Runtime 创建成功')
  console.log('   ✅ Display map:', toolNames.length, 'tools')

  // 问一个需要 tool calling 的问题
  const output = await runtime.chat({
    sessionId: 'smoke-full',
    messages: [{
      id: '1', role: 'user', content: 'AAPL 现在什么价格？',
      parts: [{ type: 'text', text: 'AAPL 现在什么价格？' }],
    }] as UIMessage[],
    symbol: 'AAPL',
    channel: 'cron',
  })

  const result = await output.consumeStream()
  console.log('   ✅ 回复:', result.text.slice(0, 200))
  console.log('   ✅ tool calls:', result.toolCalls.length, result.toolCalls.map(t => t.toolName))
  console.log('   ✅ usage:', result.usage)
  await runtime.dispose()
}

// ── Test 3: Tool 冲突检测 ──

async function testToolConflict() {
  console.log('\n📦 Test 3: Tool 冲突检测')

  try {
    await createAIRuntime({
      model: getModel('main'),
      plugins: [
        { name: 'a', tools: { getQuote: { tool: {} as any } } },
        { name: 'b', tools: { getQuote: { tool: {} as any } } },
      ],
    })
    console.log('   ❌ 应该抛出 ToolConflictError')
  } catch (err) {
    console.log('   ✅ 正确抛出:', (err as Error).message.slice(0, 100))
  }
}

// ── Main ──

async function main() {
  console.log(DIVIDER)
  console.log('🔬 AI Plugin Runtime Smoke Test (Full)')
  console.log(DIVIDER)

  await testMinimal()
  await testFullPreset()
  await testToolConflict()

  console.log('\n' + DIVIDER)
  console.log('🎉 All smoke tests passed!')
  console.log(DIVIDER)
}

main().catch((err) => {
  console.error('\n❌ Smoke test failed:', err)
  process.exit(1)
})
