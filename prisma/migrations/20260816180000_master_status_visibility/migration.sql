-- TKT-008: QuestionMaster lifecycle + visibility.
-- PENDING (AI-novel, awaiting admin validation) vs PUBLISHED (in the bank),
-- isPublic opt-in, and createdBy ownership. Existing masters become
-- PUBLISHED with no owner (treated as admin/legacy bank).

-- CreateEnum
CREATE TYPE "MasterStatus" AS ENUM ('PENDING', 'PUBLISHED');

-- AlterTable
ALTER TABLE "QuestionMaster" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "MasterStatus" NOT NULL DEFAULT 'PUBLISHED';

-- CreateIndex
CREATE INDEX "QuestionMaster_status_isLatest_idx" ON "QuestionMaster"("status", "isLatest");

-- AddForeignKey
ALTER TABLE "QuestionMaster" ADD CONSTRAINT "QuestionMaster_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
