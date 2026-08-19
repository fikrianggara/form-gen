-- CreateTable
CREATE TABLE "SurveyQuestionnaire" (
    "surveyId" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,

    CONSTRAINT "SurveyQuestionnaire_pkey" PRIMARY KEY ("surveyId","questionnaireId")
);

-- Backfill from the legacy single-FK column (TKT-041): every questionnaire
-- that had a surveyId becomes a join row. No data loss — verified by count
-- in the migration log before the column is dropped.
INSERT INTO "SurveyQuestionnaire" ("surveyId", "questionnaireId")
SELECT "surveyId", "id" FROM "Questionnaire" WHERE "surveyId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "SurveyQuestionnaire_questionnaireId_idx" ON "SurveyQuestionnaire"("questionnaireId");

-- AddForeignKey
ALTER TABLE "SurveyQuestionnaire" ADD CONSTRAINT "SurveyQuestionnaire_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQuestionnaire" ADD CONSTRAINT "SurveyQuestionnaire_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: drop the legacy single-survey FK column (TKT-041). The column's
-- index and FK constraint are dropped implicitly by Postgres.
ALTER TABLE "Questionnaire" DROP COLUMN "surveyId";
