/**
 * embedding.ts 单元测试 (centralized providers)
 *
 * 测试场景:
 * - T03-01: generateEmbedding 返回正确的 embedding 数组
 * - T03-02: embed 被调用时 value 参数正确传递
 * - T03-03: embed 被调用时 model 来自 getEmbeddingModel()
 * - T03-04: embed 被调用时 providerOptions 包含正确的 dimensions
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

// ─── Mock 设置 ───

const mockEmbed = mock(() =>
  Promise.resolve({ embedding: [0.1, 0.2, 0.3] }),
)

const mockGetEmbeddingModel = mock(() => ({ modelId: 'mock-embedding' }))

mock.module('@/core/ai/providers', () => ({
  getEmbeddingModel: mockGetEmbeddingModel,
}))

mock.module('ai', () => ({
  embed: mockEmbed,
}))

// ─── 测试套件 ───

describe('03: embedding', () => {
  beforeEach(() => {
    mockEmbed.mockClear()
    mockGetEmbeddingModel.mockClear()
  })

  afterEach(() => {
    // nothing to restore — no env vars manipulated here
  })

  it('T03-01: generateEmbedding 返回 embedding 数组', async () => {
    const { generateEmbedding } = await import('@/core/ai/memory/embedding')
    const result = await generateEmbedding('test text')

    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(mockEmbed).toHaveBeenCalledTimes(1)
  })

  it('T03-02: embed 被调用时 value 参数为传入文本', async () => {
    const { generateEmbedding } = await import('@/core/ai/memory/embedding')
    await generateEmbedding('hello world')

    expect(mockEmbed).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'hello world' }),
    )
  })

  it('T03-03: embed 被调用时 model 来自 getEmbeddingModel()', async () => {
    const { generateEmbedding } = await import('@/core/ai/memory/embedding')
    await generateEmbedding('test')

    expect(mockGetEmbeddingModel).toHaveBeenCalledTimes(1)
    expect(mockEmbed).toHaveBeenCalledWith(
      expect.objectContaining({ model: { modelId: 'mock-embedding' } }),
    )
  })

  it('T03-04: embed 被调用时 providerOptions 包含正确的 dimensions', async () => {
    const { generateEmbedding } = await import('@/core/ai/memory/embedding')
    await generateEmbedding('test')

    expect(mockEmbed).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { openai: { dimensions: 768 } },
      }),
    )
  })
})
