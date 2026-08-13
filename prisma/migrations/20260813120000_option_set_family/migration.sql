-- Stable option set family identity so renames never split a version family.

ALTER TABLE "OptionSet" ADD COLUMN "familyId" TEXT;

-- Backfill existing rows: each current version becomes its own family head.
UPDATE "OptionSet" SET "familyId" = id WHERE "familyId" IS NULL;

CREATE INDEX "OptionSet_familyId_idx" ON "OptionSet"("familyId");
