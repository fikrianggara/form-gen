-- Question blocks: group questions into blocks with multi-set entry rules.
-- Also adds Questionnaire.requiresAccount (respondent accounts plan, TKT-001).

ALTER TABLE "Questionnaire" ADD COLUMN "requiresAccount" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "QuestionnaireQuestion" ADD COLUMN "blockId" TEXT;

CREATE TABLE "QuestionnaireBlock" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "entryRule" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionnaireBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuestionnaireBlock_questionnaireId_order_idx" ON "QuestionnaireBlock"("questionnaireId", "order");

ALTER TABLE "QuestionnaireBlock" ADD CONSTRAINT "QuestionnaireBlock_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuestionnaireQuestion" ADD CONSTRAINT "QuestionnaireQuestion_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "QuestionnaireBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
