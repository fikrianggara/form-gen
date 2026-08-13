-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'RADIO', 'CHECKBOX', 'SELECT', 'RATING');

-- CreateEnum
CREATE TYPE "OptionSource" AS ENUM ('STATIC', 'EXTERNAL_API');

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionMaster" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questionType" "QuestionType" NOT NULL,
    "requiredDefault" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "minValue" INTEGER,
    "maxValue" INTEGER,
    "maxLength" INTEGER,
    "ratingMax" INTEGER DEFAULT 5,
    "optionSetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "OptionSource" NOT NULL DEFAULT 'STATIC',
    "apiUrl" TEXT,
    "apiMethod" TEXT DEFAULT 'GET',
    "apiHeaders" JSONB DEFAULT '{}',
    "itemsPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "optionSetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Questionnaire" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'DRAFT',
    "acceptMultipleResponses" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Questionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireQuestion" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "questionMasterId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "visibilityRule" JSONB,
    "isRepeatable" BOOLEAN NOT NULL DEFAULT false,
    "isAggregate" BOOLEAN NOT NULL DEFAULT false,
    "aggregateConfig" JSONB,
    "parentId" TEXT,

    CONSTRAINT "QuestionnaireQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "respondentToken" TEXT NOT NULL,
    "respondentLabel" TEXT,
    "status" "ResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerGroup" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "parentQuestionId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerGroupId" TEXT,
    "textValue" TEXT,
    "numberValue" DOUBLE PRECISION,
    "dateValue" TIMESTAMP(3),
    "jsonValue" JSONB,
    "isComputed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionMaster_code_key" ON "QuestionMaster"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OptionSet_name_key" ON "OptionSet"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Option_optionSetId_value_key" ON "Option"("optionSetId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Questionnaire_slug_key" ON "Questionnaire"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireQuestion_questionnaireId_questionMasterId_pare_key" ON "QuestionnaireQuestion"("questionnaireId", "questionMasterId", "parentId");

-- CreateIndex
CREATE INDEX "Response_questionnaireId_respondentToken_idx" ON "Response"("questionnaireId", "respondentToken");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerGroup_responseId_parentQuestionId_rowIndex_key" ON "AnswerGroup"("responseId", "parentQuestionId", "rowIndex");

-- CreateIndex
CREATE INDEX "Answer_responseId_idx" ON "Answer"("responseId");

-- AddForeignKey
ALTER TABLE "QuestionMaster" ADD CONSTRAINT "QuestionMaster_optionSetId_fkey" FOREIGN KEY ("optionSetId") REFERENCES "OptionSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_optionSetId_fkey" FOREIGN KEY ("optionSetId") REFERENCES "OptionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireQuestion" ADD CONSTRAINT "QuestionnaireQuestion_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireQuestion" ADD CONSTRAINT "QuestionnaireQuestion_questionMasterId_fkey" FOREIGN KEY ("questionMasterId") REFERENCES "QuestionMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireQuestion" ADD CONSTRAINT "QuestionnaireQuestion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "QuestionnaireQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerGroup" ADD CONSTRAINT "AnswerGroup_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerGroup" ADD CONSTRAINT "AnswerGroup_parentQuestionId_fkey" FOREIGN KEY ("parentQuestionId") REFERENCES "QuestionnaireQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuestionnaireQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_answerGroupId_fkey" FOREIGN KEY ("answerGroupId") REFERENCES "AnswerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
