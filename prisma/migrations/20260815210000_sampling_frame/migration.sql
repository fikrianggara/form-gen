-- CreateTable
CREATE TABLE "SamplingFrameEntry" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "contactType" TEXT NOT NULL DEFAULT 'EMAIL',
    "rowIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SamplingFrameEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SamplingFrameEntry_questionnaireId_idx" ON "SamplingFrameEntry"("questionnaireId");

-- CreateIndex
CREATE UNIQUE INDEX "SamplingFrameEntry_questionnaireId_rowIndex_key" ON "SamplingFrameEntry"("questionnaireId", "rowIndex");

-- AddForeignKey
ALTER TABLE "SamplingFrameEntry" ADD CONSTRAINT "SamplingFrameEntry_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
