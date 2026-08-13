-- Embedding pipeline: vector column for semantic retrieval.
-- Dimension 1024: the configured model (gemini-embedding-2 via OpenAI-compatible
-- endpoint) supports a `dimensions` parameter; 1024 stays under pgvector's
-- 2000-dimension limit for HNSW indexes. Vectors are written via raw SQL
-- (Prisma models this column as Unsupported("vector(1024)")).

ALTER TABLE "QuestionMaster" ADD COLUMN "embedding" vector(1024);

-- HNSW cosine index for approximate nearest-neighbor search.
CREATE INDEX "QuestionMaster_embedding_hnsw_idx"
  ON "QuestionMaster" USING hnsw (embedding vector_cosine_ops);
