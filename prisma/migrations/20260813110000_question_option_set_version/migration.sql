-- Per-question option set version override: lets a placed question use a
-- specific OptionSet version instead of the one pinned on its master version.
-- NULL means "use the master's option set" (existing behavior).

ALTER TABLE "QuestionnaireQuestion" ADD COLUMN "optionSetId" TEXT;

ALTER TABLE "QuestionnaireQuestion" ADD CONSTRAINT "QuestionnaireQuestion_optionSetId_fkey" FOREIGN KEY ("optionSetId") REFERENCES "OptionSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
