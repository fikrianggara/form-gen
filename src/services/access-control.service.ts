import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { requireAuth } from "@/lib/auth/rbac";

/**
 * Ownership gate for questionnaire-management actions (TKT-017).
 *
 * - ADMIN: can manage any questionnaire's responses.
 * - OPERATOR: can manage responses of questionnaires they created,
 *   plus legacy rows with no creator (createdBy null) so existing data
 *   stays workable.
 * - Anonymous: always rejected.
 */
export async function assertCanManageQuestionnaire(
  session: SessionPayload | null,
  questionnaireId: string
): Promise<void> {
  requireAuth(session);
  if (session.role === "ADMIN") return;

  const q = await db.questionnaire.findUnique({
    where: { id: questionnaireId },
    select: { createdBy: true },
  });
  if (!q) throw new NotFoundError("Questionnaire not found");

  if (q.createdBy === null || q.createdBy === session.sub) return;
  throw new ForbiddenError("You can only manage responses of questionnaires you created");
}
