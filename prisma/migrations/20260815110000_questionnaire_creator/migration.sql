-- AlterTable
ALTER TABLE "Questionnaire" ADD COLUMN "createdBy" TEXT;

-- CreateIndex
CREATE INDEX "Questionnaire_createdBy_idx" ON "Questionnaire"("createdBy");

-- AddForeignKey
ALTER TABLE "Questionnaire" ADD CONSTRAINT "Questionnaire_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
