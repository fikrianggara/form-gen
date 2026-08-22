-- TKT-051: User.username unique sign-in handle (login accepts username OR email).
-- Nullable-first so existing rows can be backfilled before the NOT NULL + unique
-- constraints land. Backfill uses the email local part, deduped with -2/-3
-- suffixes for rows sharing a local part (e.g. a@x.com and a@y.com).
-- NOTE: the migrate-diff output's spurious DROP INDEX statements for the
-- RAG extension indexes (QuestionMaster_title_trgm_idx / description_trgm_idx /
-- embedding_hnsw_idx) were trimmed — they belong to the raw-SQL RAG
-- migrations and must not be dropped.

-- AlterTable (nullable first)
ALTER TABLE "User" ADD COLUMN     "username" TEXT;

-- Backfill existing users from their email local part, deduped.
WITH numbered AS (
  SELECT
    id,
    split_part(email, '@', 1) AS base,
    row_number() OVER (PARTITION BY split_part(email, '@', 1) ORDER BY "createdAt", id) AS rn
  FROM "User"
)
UPDATE "User" u
SET username = CASE
  WHEN n.rn = 1 THEN n.base
  ELSE n.base || '-' || (n.rn - 1)::text
END
FROM numbered n
WHERE u.id = n.id;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AlterTable (now that every row has a username)
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
