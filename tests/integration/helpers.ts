import { beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";

const TABLES = [
  "Answer",
  "AnswerGroup",
  "ResponseAudit",
  "Response",
  "QuestionnaireQuestion",
  "Questionnaire",
  "Option",
  "OptionSet",
  "QuestionMaster",
  "LoginAttempt",
  "RateLimitEvent",
  "Invitation",
  "User",
] as const;

/** Wipe all rows from every table, in FK-safe order (CASCADE makes order moot). */
export async function truncateAll(): Promise<void> {
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
}

/** Truncate before every test by default. */
export function useCleanDb(): void {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await db.$disconnect();
  });
}
