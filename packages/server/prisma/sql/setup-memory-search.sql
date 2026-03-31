-- pgvector 扩展（确认存在）
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_search 扩展（ParadeDB 提供）
CREATE EXTENSION IF NOT EXISTS pg_search;

-- HNSW 向量索引（768 维，cosine 距离）
CREATE INDEX IF NOT EXISTS memory_chunk_embedding_idx
  ON "MemoryChunk" USING hnsw (embedding vector_cosine_ops);

-- BM25 全文搜索索引（jieba 中文分词）
CREATE INDEX IF NOT EXISTS memory_chunk_bm25_idx ON "MemoryChunk"
USING bm25 (id, content)
WITH (
  key_field = 'id',
  text_fields = '{
    "content": {
      "tokenizer": {"type": "jieba"}
    }
  }'
);
