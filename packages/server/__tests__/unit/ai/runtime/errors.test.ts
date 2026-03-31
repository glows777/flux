import { describe, expect, test } from 'bun:test'
import { PluginError, ToolConflictError } from '../../../../src/core/ai/runtime/errors'

describe('PluginError', () => {
  test('includes plugin name and hook name in message', () => {
    const cause = new Error('connection lost')
    const err = new PluginError('memory', 'afterChat', cause)
    expect(err.message).toContain('memory')
    expect(err.message).toContain('afterChat')
    expect(err.pluginName).toBe('memory')
    expect(err.hookName).toBe('afterChat')
    expect(err.cause).toBe(cause)
    expect(err).toBeInstanceOf(Error)
  })
})

describe('ToolConflictError', () => {
  test('includes tool name and both plugin names', () => {
    const err = new ToolConflictError('getQuote', 'data', 'trading')
    expect(err.message).toContain('getQuote')
    expect(err.message).toContain('data')
    expect(err.message).toContain('trading')
    expect(err.toolName).toBe('getQuote')
    expect(err.pluginA).toBe('data')
    expect(err.pluginB).toBe('trading')
    expect(err).toBeInstanceOf(Error)
  })
})
