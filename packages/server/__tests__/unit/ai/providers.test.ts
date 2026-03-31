import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { getModel, getEmbeddingModel, resetProviders } from '@/core/ai/providers'

const originalEnv = { ...process.env }

function setAnthropicEnv() {
  process.env.ANTHROPIC_API_KEY = 'test-key'
}

function setOpenAIEnv() {
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.OPENAI_BASE_URL = 'http://localhost'
}

describe('providers', () => {
  beforeEach(() => {
    resetProviders()
    // Clear provider-related keys so "missing key" tests work
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_BASE_URL
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.MAIN_MODEL
    delete process.env.LIGHT_MODEL
    delete process.env.SEARCH_MODEL
    delete process.env.EMBEDDING_API_KEY
    delete process.env.EMBEDDING_BASE_URL
    delete process.env.EMBEDDING_MODEL
  })

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  describe('getModel (slot mode)', () => {
    test('returns a model for "main" slot', () => {
      setAnthropicEnv()
      const model = getModel('main')
      expect(model).toBeDefined()
      expect(model.modelId).toContain('claude-sonnet-4-6')
    })

    test('returns a model for "light" slot', () => {
      setOpenAIEnv()
      const model = getModel('light')
      expect(model).toBeDefined()
    })

    test('respects MAIN_MODEL env override', () => {
      setAnthropicEnv()
      process.env.MAIN_MODEL = 'claude-opus-4-6'
      const model = getModel('main')
      expect(model.modelId).toContain('claude-opus-4-6')
    })

    test('throws when anthropic key missing for main slot', () => {
      expect(() => getModel('main')).toThrow('ANTHROPIC_API_KEY')
    })

    test('throws when openai key missing for light slot', () => {
      expect(() => getModel('light')).toThrow('OPENAI_API_KEY')
    })
  })

  describe('getModel (provider mode)', () => {
    test('explicit anthropic provider + modelId', () => {
      setAnthropicEnv()
      const model = getModel('anthropic', 'claude-opus-4-6')
      expect(model).toBeDefined()
    })

    test('explicit openai provider + modelId', () => {
      setOpenAIEnv()
      const model = getModel('openai', 'gpt-4o')
      expect(model).toBeDefined()
    })
  })

  describe('getEmbeddingModel', () => {
    test('returns embedding model with EMBEDDING_ env vars', () => {
      process.env.EMBEDDING_API_KEY = 'embed-key'
      process.env.EMBEDDING_BASE_URL = 'http://localhost'
      const model = getEmbeddingModel()
      expect(model).toBeDefined()
    })

    test('falls back to OPENAI_ env vars when EMBEDDING_ not set', () => {
      setOpenAIEnv()
      const model = getEmbeddingModel()
      expect(model).toBeDefined()
    })
  })
})
