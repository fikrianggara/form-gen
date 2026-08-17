"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/http";
import { requirePermission } from "@/lib/auth/rbac";
import { toAppError } from "@/lib/errors";
import {
  createOrganization,
  updateOrganization,
  assignUserOrganization,
  createSurvey,
  assignQuestionnaireToSurvey,
} from "@/services/org.service";
import { setQuestionMasterPublic } from "@/services/master-data.service";

function actionError(err: unknown): { error: string } {
  const appErr = toAppError(err);
  return { error: appErr.message };
}

/** Admin-only: create an organization. */
export async function createOrganizationAction(input: {
  name: string;
  description?: string | null;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_USERS");
    await createOrganization(input);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/orgs");
  return {};
}

/** Admin-only: rename/update an organization. */
export async function updateOrganizationAction(input: {
  id: string;
  name: string;
  description?: string | null;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_USERS");
    await updateOrganization(input.id, input);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/orgs");
  return {};
}

/** Admin-only: set a user's organization membership (null = unassign). */
export async function assignUserOrganizationAction(input: {
  userId: string;
  organizationId: string | null;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_USERS");
    await assignUserOrganization(input.userId, input.organizationId);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/orgs");
  return {};
}

/** Admin-only: create a survey under an organization. */
export async function createSurveyAction(input: {
  organizationId: string;
  name: string;
  description?: string | null;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_USERS");
    await createSurvey(input);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/orgs");
  return {};
}

/**
 * Assign a questionnaire to a survey (null detaches to legacy flat).
 * Operators can only assign into surveys of their own organization.
 */
export async function assignQuestionnaireToSurveyAction(input: {
  questionnaireId: string;
  surveyId: string | null;
}): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_QUESTIONNAIRES");
    if (session.role !== "ADMIN" && input.surveyId) {
      const { assertCanAccessSurvey } = await import("@/services/access-control.service");
      await assertCanAccessSurvey(session, input.surveyId);
    }
    await assignQuestionnaireToSurvey(input.questionnaireId, input.surveyId);
  } catch (err) {
    return actionError(err);
  }
  return {};
}

/** Admin-only: publish/unpublish a question master (org visibility). */
export async function setQuestionMasterPublicAction(input: {
  id: string;
  isPublic: boolean;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_MASTER_DATA");
    await setQuestionMasterPublic(input.id, input.isPublic);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/question-masters");
  return {};
}
