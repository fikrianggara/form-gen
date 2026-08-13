-- Partial unique indexes: Postgres treats NULLs as distinct in plain unique
-- constraints, so enforce "no duplicate master in the same position" per group.
-- Top-level questions have parentId NULL; children have parentId NOT NULL.

CREATE UNIQUE INDEX "QuestionnaireQuestion_top_level_unique"
  ON "QuestionnaireQuestion" ("questionnaireId", "questionMasterId")
  WHERE "parentId" IS NULL;

CREATE UNIQUE INDEX "QuestionnaireQuestion_child_unique"
  ON "QuestionnaireQuestion" ("questionnaireId", "questionMasterId", "parentId")
  WHERE "parentId" IS NOT NULL;
