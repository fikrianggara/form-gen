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
  connectQuestionnaireToSurveys,
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
 * Set the full set of surveys a questionnaire belongs to (TKT-041 M2M).
 * Operators can only connect surveys of their own organization.
 */
export async function connectQuestionnaireToSurveysAction(input: {
  questionnaireId: string;
  surveyIds: string[];
}): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_QUESTIONNAIRES");
    if (session.role !== "ADMIN") {
      const { assertCanAccessSurvey } = await import("@/services/access-control.service");
      for (const surveyId of input.surveyIds) {
        await assertCanAccessSurvey(session, surveyId);
      }
    }
    await connectQuestionnaireToSurveys(input.questionnaireId, input.surveyIds);
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
