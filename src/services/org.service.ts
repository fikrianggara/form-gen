import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import type { SessionPayload } from "@/lib/auth/session";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------- organizations

export async function createOrganization(input: {
  name: string;
  description?: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new AppError("Organization name is required", 422, "ORG_NAME_REQUIRED");
  const slug = slugify(name);
  const existing = await db.organization.findUnique({ where: { slug } });
  if (existing) {
    throw new AppError("An organization with this name already exists", 409, "ORG_SLUG_TAKEN");
  }
  return db.organization.create({
    data: { name, slug, description: input.description ?? null },
  });
}

export async function listOrganizations() {
  return db.organization.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true, surveys: true } } },
  });
}

export async function updateOrganization(
  id: string,
  input: { name?: string; description?: string | null }
) {
  const org = await db.organization.findUnique({ where: { id } });
  if (!org) throw new NotFoundError("Organization not found");
  return db.organization.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name.trim() } : {}),
      description: input.description ?? null,
    },
  });
}

// ---------------------------------------------------------------- membership

export async function assignUserOrganization(userId: string, organizationId: string | null) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User not found");
  if (organizationId) {
    const org = await db.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundError("Organization not found");
  }
  return db.user.update({ where: { id: userId }, data: { organizationId } });
}

export async function listOrganizationUsers(organizationId: string) {
  return db.user.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
}

// ---------------------------------------------------------------- surveys

export async function createSurvey(input: {
  organizationId: string;
  name: string;
  description?: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new AppError("Survey name is required", 422, "SURVEY_NAME_REQUIRED");
  const org = await db.organization.findUnique({ where: { id: input.organizationId } });
  if (!org) throw new NotFoundError("Organization not found");
  return db.survey.create({
    data: { organizationId: org.id, name, description: input.description ?? null },
  });
}

export async function listSurveys(organizationId?: string) {
  return db.survey.findMany({
    where: organizationId ? { organizationId } : undefined,
    orderBy: { name: "asc" },
    include: { _count: { select: { questionnaires: true } } },
  });
}

// ---------------------------------------------------------------- assignment

/**
 * Set the full set of surveys a questionnaire belongs to (TKT-041 M2M).
 * Replace-set semantics: links not in `surveyIds` are removed, the rest kept.
 */
export async function connectQuestionnaireToSurveys(
  questionnaireId: string,
  surveyIds: string[]
) {
  const q = await db.questionnaire.findUnique({ where: { id: questionnaireId } });
  if (!q) throw new NotFoundError("Questionnaire not found");

  const unique = [...new Set(surveyIds)];
  if (unique.length > 0) {
    const surveys = await db.survey.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    const found = new Set(surveys.map((s) => s.id));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new NotFoundError(`Survey not found: ${missing.join(", ")}`);
    }
  }

  await db.$transaction([
    db.surveyQuestionnaire.deleteMany({ where: { questionnaireId } }),
    ...(unique.length > 0
      ? [
          db.surveyQuestionnaire.createMany({
            data: unique.map((surveyId) => ({ questionnaireId, surveyId })),
          }),
        ]
      : []),
  ]);

  return db.questionnaire.findUnique({
    where: { id: questionnaireId },
    include: { surveys: { include: { survey: true } } },
  });
}

/** Surveys using a questionnaire (TKT-041 M2M). */
export async function listQuestionnaireSurveys(questionnaireId: string) {
  const q = await db.questionnaire.findUnique({
    where: { id: questionnaireId },
    select: { surveys: { include: { survey: true } } },
  });
  if (!q) throw new NotFoundError("Questionnaire not found");
  return q.surveys.map((s) => s.survey);
}

// ---------------------------------------------------------------- survey side (TKT-042)

/** Survey with org + connected questionnaires (join rows expanded). */
export async function getSurveyWithQuestionnaires(surveyId: string) {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    include: {
      organization: true,
      questionnaires: { include: { questionnaire: true } },
    },
  });
  if (!survey) throw new NotFoundError("Survey not found");
  return survey;
}

/**
 * Set the full set of questionnaires connected to a survey (TKT-042).
 * Replace-set from the survey side; missing questionnaires are rejected.
 */
export async function setSurveyQuestionnaires(surveyId: string, questionnaireIds: string[]) {
  const survey = await db.survey.findUnique({ where: { id: surveyId } });
  if (!survey) throw new NotFoundError("Survey not found");

  const unique = [...new Set(questionnaireIds)];
  if (unique.length > 0) {
    const qs = await db.questionnaire.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    const found = new Set(qs.map((q) => q.id));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new NotFoundError(`Questionnaire not found: ${missing.join(", ")}`);
    }
  }

  await db.$transaction([
    db.surveyQuestionnaire.deleteMany({ where: { surveyId } }),
    ...(unique.length > 0
      ? [
          db.surveyQuestionnaire.createMany({
            data: unique.map((questionnaireId) => ({ surveyId, questionnaireId })),
          }),
        ]
      : []),
  ]);
}

/** Remove a single questionnaire link from a survey; the questionnaire itself is kept. */
export async function disconnectSurveyQuestionnaire(surveyId: string, questionnaireId: string) {
  await db.surveyQuestionnaire.delete({
    where: { surveyId_questionnaireId: { surveyId, questionnaireId } },
  });
}

/** Delete a survey and its join rows (FK cascade); connected questionnaires are KEPT. */
export async function deleteSurvey(surveyId: string) {
  const survey = await db.survey.findUnique({ where: { id: surveyId } });
  if (!survey) throw new NotFoundError("Survey not found");
  await db.survey.delete({ where: { id: surveyId } });
}

/**
 * Questionnaires the viewer may connect to a survey (TKT-042 picker):
 * ADMIN sees all; OPERATOR sees what they can manage — their own, legacy
 * (no creator), or any with a survey in their organization.
 */
export async function listConnectableQuestionnaires(session: SessionPayload) {
  if (session.role === "ADMIN") {
    return db.questionnaire.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, slug: true },
    });
  }
  return db.questionnaire.findMany({
    where: {
      OR: [
        { createdBy: session.sub },
        { createdBy: null },
        { surveys: { some: { survey: { organizationId: session.organizationId ?? "__none__" } } } },
      ],
    },
    orderBy: { title: "asc" },
    select: { id: true, title: true, slug: true },
  });
}
