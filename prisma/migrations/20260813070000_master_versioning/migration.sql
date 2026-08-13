-- DropIndex
DROP INDEX "OptionSet_name_key";

-- DropIndex
DROP INDEX "QuestionMaster_code_key";

-- AlterTable
ALTER TABLE "OptionSet" ADD COLUMN     "isLatest" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "QuestionMaster" ADD COLUMN     "isLatest" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "OptionSet_name_isLatest_idx" ON "OptionSet"("name", "isLatest");

-- CreateIndex
CREATE UNIQUE INDEX "OptionSet_name_version_key" ON "OptionSet"("name", "version");

-- CreateIndex
CREATE INDEX "QuestionMaster_code_isLatest_idx" ON "QuestionMaster"("code", "isLatest");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionMaster_code_version_key" ON "QuestionMaster"("code", "version");

