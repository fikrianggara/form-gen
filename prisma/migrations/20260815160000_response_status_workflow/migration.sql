-- TKT-024: response status workflow + audit trail.
-- Renames COMPLETED → SUBMITTED (semantics preserved), adds EDITED + APPROVED,
-- creates ResponseAudit history table.

-- 0. New enums used by the audit table.
CREATE TYPE "ResponseActorType" AS ENUM ('RESPONDENT', 'ADMIN', 'OPERATOR');
CREATE TYPE "ResponseAuditAction" AS ENUM ('SUBMIT', 'ADMIN_EDIT', 'APPROVE');

-- 1. Rename the enum value in place — every existing 'COMPLETED' row becomes
-- 'SUBMITTED' automatically (no cast needed, no data loss).
ALTER TYPE "ResponseStatus" RENAME VALUE 'COMPLETED' TO 'SUBMITTED';

-- 2. Add the workflow statuses.
ALTER TYPE "ResponseStatus" ADD VALUE 'EDITED';
ALTER TYPE "ResponseStatus" ADD VALUE 'APPROVED';

-- 3. Audit history table.
CREATE TABLE "ResponseAudit" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "actorType" "ResponseActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "action" "ResponseAuditAction" NOT NULL,
    "fromStatus" "ResponseStatus" NOT NULL,
    "toStatus" "ResponseStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResponseAudit_pkey" PRIMARY KEY ("id")
);

-- 4. Indexes + FK.
CREATE INDEX "ResponseAudit_responseId_idx" ON "ResponseAudit"("responseId");

ALTER TABLE "ResponseAudit" ADD CONSTRAINT "ResponseAudit_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;
