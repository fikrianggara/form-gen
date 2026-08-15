"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/http";
import { requirePermission } from "@/lib/auth/rbac";
import { toAppError } from "@/lib/errors";
import { assertCanManageQuestionnaire } from "@/services/access-control.service";
import {
  deleteResponse,
  editResponseAsAdmin,
  approveResponse,
  mailblastRespondent,
} from "@/services/response-admin.service";
import type { SaveResponseInput } from "@/services/response.service";

function actionError(err: unknown): { error: string } {
  return { error: toAppError(err).message };
}

/** Delete a response (owner/admin only). */
export async function deleteResponseAction(input: {
  questionnaireId: string;
  responseId: string;
}): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_QUESTIONNAIRES");
    await assertCanManageQuestionnaire(session, input.questionnaireId);
    await deleteResponse(input.responseId);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/responses`);
  return {};
}

/** Mailblast one respondent their unique link (owner/admin only). */
export async function mailblastRespondentAction(input: {
  questionnaireId: string;
  responseId: string;
}): Promise<{ error?: string; link?: string; email?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_QUESTIONNAIRES");
    await assertCanManageQuestionnaire(session, input.questionnaireId);
    const result = await mailblastRespondent(input.responseId);
    return { link: result.link, email: result.email };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Save an edited response (owner/admin only, TKT-024). Records the acting
 * user and moves the response to EDITED — the admin path no longer goes
 * through the respondent immutability guard.
 */
export async function updateResponseAction(input: {
  questionnaireId: string;
  responseId: string;
  data: SaveResponseInput;
}): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_QUESTIONNAIRES");
    await assertCanManageQuestionnaire(session, input.questionnaireId);
    await editResponseAsAdmin(input.responseId, input.data, {
      userId: session.sub,
      name: session.name,
      role: session.role,
    });
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/responses`);
  return {};
}

/** Approve a submitted/edited response (owner/admin only, TKT-024). */
export async function approveResponseAction(input: {
  questionnaireId: string;
  responseId: string;
}): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_QUESTIONNAIRES");
    await assertCanManageQuestionnaire(session, input.questionnaireId);
    await approveResponse(input.responseId, {
      userId: session.sub,
      name: session.name,
      role: session.role,
    });
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/responses`);
  return {};
}
