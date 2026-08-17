import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";

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

/** Attach a questionnaire to a survey (null detaches to legacy flat). */
export async function assignQuestionnaireToSurvey(
  questionnaireId: string,
  surveyId: string | null
) {
  const q = await db.questionnaire.findUnique({ where: { id: questionnaireId } });
  if (!q) throw new NotFoundError("Questionnaire not found");
  if (surveyId) {
    const survey = await db.survey.findUnique({ where: { id: surveyId } });
    if (!survey) throw new NotFoundError("Survey not found");
  }
  return db.questionnaire.update({
    where: { id: questionnaireId },
    data: { surveyId },
  });
}
