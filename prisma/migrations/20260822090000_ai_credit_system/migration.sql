-- TKT-069: AI credit system — AiCreditConfig singleton, User.aiCreditsPerDay
-- override, AiCreditUsage (date-keyed daily usage), AiCreditAdjustment (dated
-- top-ups/revokes with audit). Daily "reset" is inherent: balance(today) =
-- allowance − used(today) + Σ adjustments(today); no cron needed.
-- NOTE: the migrate-diff output's spurious DROP INDEX statements for the
-- RAG extension indexes (QuestionMaster_title_trgm_idx / description_trgm_idx /
-- embedding_hnsw_idx) were trimmed — they belong to the raw-SQL RAG
-- migrations and must not be dropped.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiCreditsPerDay" INTEGER;

-- CreateTable
CREATE TABLE "AiCreditConfig" (
    "id" TEXT NOT NULL,
    "dailyDefault" INTEGER NOT NULL DEFAULT 20,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCreditConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCreditUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCreditUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCreditAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCreditAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCreditUsage_date_idx" ON "AiCreditUsage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AiCreditUsage_userId_date_key" ON "AiCreditUsage"("userId", "date");

-- CreateIndex
CREATE INDEX "AiCreditAdjustment_userId_date_idx" ON "AiCreditAdjustment"("userId", "date");

-- CreateIndex
CREATE INDEX "AiCreditAdjustment_date_idx" ON "AiCreditAdjustment"("date");

-- AddForeignKey
ALTER TABLE "AiCreditUsage" ADD CONSTRAINT "AiCreditUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCreditAdjustment" ADD CONSTRAINT "AiCreditAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
