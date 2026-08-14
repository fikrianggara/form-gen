ALTER TABLE "Questionnaire" ADD COLUMN     "sampleEmails" JSONB DEFAULT '[]';

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "responseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_questionnaireId_idx" ON "Invitation"("questionnaireId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

