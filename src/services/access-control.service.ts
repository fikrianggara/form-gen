import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { requireAuth } from "@/lib/auth/rbac";

/**
 * Ownership + org gate for questionnaire-management actions (TKT-017, TKT-014).
 *
 * - ADMIN: can manage any questionnaire.
 * - OPERATOR: can manage a questionnaire when any of:
 *   - they created it, or
 *   - it is a legacy row with no creator (createdBy null), or
 *   - ANY of its surveys belongs to the operator's organization (TKT-041 M2M).
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
    select: {
      createdBy: true,
      surveys: { select: { survey: { select: { organizationId: true } } } },
    },
  });
  if (!q) throw new NotFoundError("Questionnaire not found");

  if (q.createdBy === null || q.createdBy === session.sub) return;
  if (q.surveys.some((s) => s.survey.organizationId === session.organizationId)) return;
  throw new ForbiddenError("You can only manage questionnaires in your organization");
}

/**
 * Strict ownership gate for DELETING a questionnaire (TKT-040).
 * Stricter than assertCanManageQuestionnaire: an OPERATOR may delete ONLY a
 * questionnaire they created — legacy (createdBy null) and org-scoped rows
 * require ADMIN. Deleting is destructive and irreversible, so the bar is
 * deliberately higher than edit/duplicate.
 */
export async function assertCanDeleteQuestionnaire(
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
  if (q.createdBy === session.sub) return;
  throw new ForbiddenError("Only the creator or an admin can delete this questionnaire");
}

/**
 * Survey-level gate (TKT-014): ADMIN sees everything; OPERATOR only surveys
 * inside their own organization.
 */
export async function assertCanAccessSurvey(
  session: SessionPayload | null,
  surveyId: string
): Promise<void> {
  requireAuth(session);
  if (session.role === "ADMIN") return;

  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { organizationId: true },
  });
  if (!survey) throw new NotFoundError("Survey not found");

  if (survey.organizationId === session.organizationId) return;
  throw new ForbiddenError("You can only access surveys in your organization");
}
