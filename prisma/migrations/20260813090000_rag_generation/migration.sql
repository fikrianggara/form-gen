-- AlterTable
ALTER TABLE "QuestionnaireQuestion" ADD COLUMN     "aiConfidence" DOUBLE PRECISION,
ADD COLUMN     "aiLowConfidence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiSuggested" BOOLEAN NOT NULL DEFAULT false;


-- RAG retrieval support: trigram similarity search over the question bank.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "QuestionMaster_title_trgm_idx"
  ON "QuestionMaster" USING gin (title gin_trgm_ops);

CREATE INDEX "QuestionMaster_description_trgm_idx"
  ON "QuestionMaster" USING gin (description gin_trgm_ops);
