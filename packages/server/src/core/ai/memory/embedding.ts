import { embed } from 'ai'
import { getEmbeddingModel } from '../providers'

const EMBEDDING_DIMENSIONS = 768

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: text,
    providerOptions: {
      openai: { dimensions: EMBEDDING_DIMENSIONS },
    },
  })
  return embedding
}
