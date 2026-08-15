"use server";

import type { QuestionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/http";
import { requirePermission } from "@/lib/auth/rbac";
import { toAppError, AppError } from "@/lib/errors";
import {
  createQuestionnaire,
  updateQuestionnaire,
  setQuestionnaireStatus,
  addQuestion,
  updateQuestionSettings,
  removeQuestion,
  reorderQuestions,
  updateQuestionMasterVersion,
  updateQuestionOptionSet,
  duplicateQuestionnaire,
  createBlock,
  updateBlock,
  deleteBlock,
  reorderBlocks,
  setQuestionBlock,
} from "@/services/questionnaire.service";
import { sendInvitations, revokeInvitation } from "@/services/invitation.service";
import {
  createQuestionMaster,
  updateQuestionMaster,
  deleteQuestionMaster,
  createOptionSet,
  updateOptionSet,
  deleteOptionSet,
} from "@/services/master-data.service";
import {
  createUser,
  updateUser,
  setUserActive,
  resetPassword,
} from "@/services/user.service";
import { generateQuestionnaireFromPrompt } from "@/services/rag.service";
import type {
  AggregateConfig,
  VisibilityRule,
} from "@/domain/types";

function actionError(err: unknown): { error: string } {
  const appError = toAppError(err);
  return { error: appError.message };
}

// ---------------------------------------------------------- questionnaires

export async function createQuestionnaireAction(input: {
  title: string;
  slug: string;
  description?: string;
  acceptMultipleResponses: boolean;
}): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    requirePermission(session, "MANAGE_QUESTIONNAIRES");
    await createQuestionnaire({
      title: input.title,
      slug: input.slug,
      description: input.description || null,
      acceptMultipleResponses: input.acceptMultipleResponses,
      createdBy: session!.sub,
    });
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateQuestionnaireSettingsAction(input: {
  id: string;
  title?: string;
  description?: string | null;
  acceptMultipleResponses?: boolean;
  sampleEmails?: string[];
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await updateQuestionnaire(input.id, input);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/dashboard/questionnaires/${input.id}/edit`);
  return {};
}

export async function sendInvitationsAction(input: {
  questionnaireId: string;
}): Promise<{
  error?: string;
  links?: Array<{ id: string; email: string; link: string; revokedAt: Date | null }>;
}> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    const invitations = await sendInvitations(input.questionnaireId);
    return {
      links: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        link: i.link,
        revokedAt: i.revokedAt,
      })),
    };
  } catch (err) {
    return actionError(err);
  }
}

export async function revokeInvitationAction(input: {
  id: string;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await revokeInvitation(input.id);
  } catch (err) {
    return actionError(err);
  }
  return {};
}

export async function setStatusAction(input: {
  id: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await setQuestionnaireStatus(input.id, input.status);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/dashboard/questionnaires/${input.id}/edit`);
  return {};
}

export async function addQuestionAction(input: {
  questionnaireId: string;
  questionMasterId: string;
  required?: boolean;
  visibilityRule?: VisibilityRule | null;
  isRepeatable?: boolean;
  isAggregate?: boolean;
  aggregateConfig?: AggregateConfig | null;
  parentId?: string | null;
  optionSetId?: string | null;
}): Promise<{ error?: string; question?: Awaited<ReturnType<typeof addQuestion>> }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    const question = await addQuestion(input);
    revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
    return { question };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateQuestionMasterVersionAction(input: {
  questionnaireId: string;
  questionId: string;
  masterVersionId: string;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await updateQuestionMasterVersion(input.questionId, input.masterVersionId);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
  return {};
}

export async function updateQuestionOptionSetAction(input: {
  questionnaireId: string;
  questionId: string;
  optionSetId: string | null;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await updateQuestionOptionSet(input.questionId, input.optionSetId);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
  return {};
}

export async function duplicateQuestionnaireAction(input: {
  questionnaireId: string;
}): Promise<{ error?: string; questionnaireId?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    const result = await duplicateQuestionnaire(input.questionnaireId);
    revalidatePath("/dashboard");
    return { questionnaireId: result.questionnaire.id };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateQuestionSettingsAction(input: {
  questionId: string;
  questionnaireId: string;
  required?: boolean;
  visibilityRule?: VisibilityRule | null;
  isRepeatable?: boolean;
  isAggregate?: boolean;
  aggregateConfig?: AggregateConfig | null;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await updateQuestionSettings(input.questionId, input);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
  return {};
}

export async function removeQuestionAction(input: {
  questionId: string;
  questionnaireId: string;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await removeQuestion(input.questionId);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
  return {};
}

export async function reorderQuestionsAction(input: {
  questionnaireId: string;
  orderedIds: string[];
  parentId?: string | null;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await reorderQuestions(input.questionnaireId, input.orderedIds, input.parentId ?? null);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
  return {};
}

// ------------------------------------------------------------ master data

export async function saveQuestionMasterAction(input: {
  id?: string;
  code: string;
  title: string;
  description?: string;
  questionType: QuestionType;
  requiredDefault: boolean;
  placeholder?: string;
  minValue?: number | null;
  maxValue?: number | null;
  maxLength?: number | null;
  ratingMax?: number | null;
  optionSetId?: string | null;
}): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    if (input.id) {
      requirePermission(session, "MANAGE_MASTER_DATA");
      await updateQuestionMaster(input.id, input);
    } else {
      requirePermission(session, "CREATE_QUESTION_MASTER");
      await createQuestionMaster(input);
    }
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/question-masters");
  return {};
}

export async function deleteQuestionMasterAction(input: { id: string }): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_MASTER_DATA");
    await deleteQuestionMaster(input.id);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/question-masters");
  return {};
}

export async function saveOptionSetAction(input: {
  id?: string;
  name: string;
  source: "STATIC" | "EXTERNAL_API";
  apiUrl?: string;
  apiMethod?: string;
  apiHeaders?: string;
  itemsPath?: string;
  apiLabelKey?: string;
  apiValueKey?: string;
  options?: Array<{ label: string; value: string }>;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_MASTER_DATA");
    const apiHeaders = parseHeaders(input.apiHeaders);
    if (input.id) {
      await updateOptionSet(input.id, {
        name: input.name,
        source: input.source,
        apiUrl: input.apiUrl || null,
        apiMethod: input.apiMethod || "GET",
        apiHeaders,
        itemsPath: input.itemsPath || null,
        apiLabelKey: input.apiLabelKey || null,
        apiValueKey: input.apiValueKey || null,
        options: input.options,
      });
    } else {
      await createOptionSet({
        name: input.name,
        source: input.source,
        apiUrl: input.apiUrl || null,
        apiMethod: input.apiMethod || "GET",
        apiHeaders,
        itemsPath: input.itemsPath || null,
        apiLabelKey: input.apiLabelKey || null,
        apiValueKey: input.apiValueKey || null,
        options: input.options,
      });
    }
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/option-sets");
  return {};
}

export async function deleteOptionSetAction(input: { id: string }): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_MASTER_DATA");
    await deleteOptionSet(input.id);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/option-sets");
  return {};
}

// ------------------------------------------------------------------ users

export async function createUserAction(input: {
  email: string;
  name: string;
  password: string;
  role: "ADMIN" | "OPERATOR";
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_USERS");
    await createUser(input);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/users");
  return {};
}

export async function updateUserAction(input: {
  id: string;
  name?: string;
  email?: string;
  role?: "ADMIN" | "OPERATOR";
  isActive?: boolean;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_USERS");
    if (input.isActive !== undefined) {
      await setUserActive(input.id, input.isActive);
    } else {
      await updateUser(input.id, {
        name: input.name,
        email: input.email,
        role: input.role,
      });
    }
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/users");
  return {};
}

export async function resetPasswordAction(input: {
  id: string;
  password: string;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_USERS");
    await resetPassword(input.id, input.password);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/admin/users");
  return {};
}

// ------------------------------------------------------------------ blocks

export async function createBlockAction(input: {
  questionnaireId: string;
  title: string;
}): Promise<{ error?: string; blockId?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    const block = await createBlock(input.questionnaireId, input.title);
    revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
    return { blockId: block.id };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateBlockAction(input: {
  blockId: string;
  questionnaireId: string;
  title?: string;
  entryRule?: VisibilityRule | null;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await updateBlock(input.blockId, { title: input.title, entryRule: input.entryRule });
    revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
    return {};
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteBlockAction(input: {
  blockId: string;
  questionnaireId: string;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await deleteBlock(input.blockId);
    revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
    return {};
  } catch (err) {
    return actionError(err);
  }
}

export async function setQuestionBlockAction(input: {
  questionId: string;
  questionnaireId: string;
  blockId: string | null;
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await setQuestionBlock(input.questionId, input.blockId);
    revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
    return {};
  } catch (err) {
    return actionError(err);
  }
}

export async function reorderBlockAction(input: {
  questionnaireId: string;
  orderedIds: string[];
}): Promise<{ error?: string }> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    await reorderBlocks(input.questionnaireId, input.orderedIds);
    revalidatePath(`/dashboard/questionnaires/${input.questionnaireId}/edit`);
    return {};
  } catch (err) {
    return actionError(err);
  }
}

// -------------------------------------------------------------------- RAG

export async function generateQuestionnaireAction(input: {
  prompt: string;
  maxQuestions?: number;
  threshold?: number;
  acceptMultipleResponses?: boolean;
}): Promise<{
  error?: string;
  questionnaireId?: string;
  matchCount?: number;
  lowCount?: number;
}> {
  try {
    requirePermission(await getSession(), "MANAGE_QUESTIONNAIRES");
    const result = await generateQuestionnaireFromPrompt(input);
    revalidatePath("/dashboard");
    return {
      questionnaireId: result.questionnaire.id,
      matchCount: result.matches.length,
      lowCount: result.matches.filter((m) => m.lowConfidence).length,
    };
  } catch (err) {
    return actionError(err);
  }
}

// ------------------------------------------------------------------ misc

function parseHeaders(raw: string | undefined): Record<string, string> | null {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
  } catch {
    throw new AppError("apiHeaders must be a valid JSON object", 422, "BAD_HEADERS");
  }
  return {};
}
