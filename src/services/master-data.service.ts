import { randomUUID } from "node:crypto";
import type { Prisma, QuestionType, MasterStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { ensureMasterEmbedding } from "@/services/embedding.service";

export const CHOICE_TYPES: QuestionType[] = ["RADIO", "CHECKBOX", "SELECT"];

/** TKT-008/TKT-014: who is looking at the master bank. Admins see everything; others see admin/legacy + their own + public + same-org masters. */
export interface MasterViewer {
  userId: string;
  role: Role;
  /** TKT-014: viewer's organization for org scoping (null = unassigned/legacy). */
  organizationId?: string | null;
}

/**
 * TKT-008/TKT-014: visibility filter for the question master bank.
 * - Admins see all masters (including PENDING suggestions awaiting validation).
 * - Operators see: PUBLISHED masters that are admin-created or legacy (no
 *   owner), PUBLISHED public masters (opt-in), PUBLISHED masters from their
 *   own organization, and masters they created themselves (any status, so
 *   their own PENDING suggestions are visible).
 * PUBLISHED masters created by other operators stay hidden unless opted public
 * or same-org; PENDING masters created by other operators stay hidden until an
 * admin publishes them.
 */
export function visibleMasterWhere(viewer?: MasterViewer | null): Prisma.QuestionMasterWhereInput {
  if (!viewer || viewer.role === "ADMIN") return {};
  return {
    OR: [
      { status: "PUBLISHED" as MasterStatus, isPublic: true },
      // Legacy bank: org-less masters (no org, no owner) are visible to everyone.
      { status: "PUBLISHED" as MasterStatus, organizationId: null, createdBy: null },
      // Admin bank: org-less masters created by admins are visible to everyone.
      { status: "PUBLISHED" as MasterStatus, organizationId: null, creator: { role: "ADMIN" } },
      // Org scoping (TKT-014): PUBLISHED masters owned by the viewer's org.
      { status: "PUBLISHED" as MasterStatus, organizationId: viewer.organizationId ?? "__none__" },
      { createdBy: viewer.userId },
    ],
  };
}

export interface QuestionMasterInput {
  code: string;
  title: string;
  description?: string | null;
  questionType: QuestionType;
  requiredDefault?: boolean;
  placeholder?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  maxLength?: number | null;
  ratingMax?: number | null;
  optionSetId?: string | null;
  /** TKT-008: creation context — owner + initial lifecycle status. */
  createdBy?: string | null;
  status?: MasterStatus;
  /** Owner organization (TKT-014); null = shared/legacy master. */
  organizationId?: string | null;
  /** Public masters are visible across organizations (TKT-014). */
  isPublic?: boolean;
}

export interface OptionInput {
  label: string;
  value: string;
  order?: number;
}

export interface OptionSetInput {
  name: string;
  source: "STATIC" | "EXTERNAL_API";
  apiUrl?: string | null;
  apiMethod?: string | null;
  apiHeaders?: Record<string, string> | null;
  itemsPath?: string | null;
  apiLabelKey?: string | null;
  apiValueKey?: string | null;
  options?: OptionInput[];
}

// ---------------------------------------------------------------- masters

export async function createQuestionMaster(input: QuestionMasterInput) {
  validateMasterFields(input);

  const existing = await db.questionMaster.findFirst({ where: { code: input.code.trim() } });
  if (existing) {
    throw new AppError(
      "A question master with this code already exists — edit it to create a new version",
      409,
      "CODE_TAKEN"
    );
  }

  const data: Prisma.QuestionMasterCreateInput = {
    code: input.code.trim(),
    version: 1,
    isLatest: true,
    title: input.title.trim(),
    description: input.description ?? null,
    questionType: input.questionType,
    status: input.status ?? "PUBLISHED",
    isPublic: input.isPublic ?? false,
    ...(input.createdBy
      ? { creator: { connect: { id: input.createdBy } } }
      : {}),
    requiredDefault: input.requiredDefault ?? false,
    placeholder: input.placeholder ?? null,
    minValue: input.minValue ?? null,
    maxValue: input.maxValue ?? null,
    maxLength: input.maxLength ?? null,
    ratingMax: input.ratingMax ?? 5,
    ...(input.organizationId
      ? { organization: { connect: { id: input.organizationId } } }
      : {}),
    ...(input.optionSetId
      ? { optionSet: { connect: { id: input.optionSetId } } }
      : {}),
  };
  const created = await db.questionMaster.create({ data });
  await tryEmbed(created.id);
  return created;
}

/**
 * Update a master by creating a NEW immutable version (same code, version + 1).
 * The previous version is marked non-latest but stays intact so questionnaires
 * that reference it keep their exact definition. No-op saves do not bump.
 */
export async function updateQuestionMaster(
  id: string,
  input: Partial<QuestionMasterInput>
) {
  const existing = await db.questionMaster.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Question master not found");

  const questionType = input.questionType ?? existing.questionType;
  const optionSetId = input.optionSetId !== undefined ? input.optionSetId : existing.optionSetId;
  validateMasterFields({ ...existing, ...input, questionType, optionSetId } as QuestionMasterInput);

  if (optionSetId && optionSetId !== existing.optionSetId) {
    const set = await db.optionSet.findUnique({ where: { id: optionSetId } });
    if (!set) throw new NotFoundError("Option set not found");
  }

  const next = {
    title: input.title !== undefined ? input.title.trim() : existing.title,
    description:
      input.description !== undefined ? (input.description ?? null) : existing.description,
    questionType,
    requiredDefault:
      input.requiredDefault !== undefined ? input.requiredDefault : existing.requiredDefault,
    placeholder:
      input.placeholder !== undefined ? (input.placeholder ?? null) : existing.placeholder,
    minValue: input.minValue !== undefined ? (input.minValue ?? null) : existing.minValue,
    maxValue: input.maxValue !== undefined ? (input.maxValue ?? null) : existing.maxValue,
    maxLength: input.maxLength !== undefined ? (input.maxLength ?? null) : existing.maxLength,
    ratingMax: input.ratingMax !== undefined ? (input.ratingMax ?? 5) : existing.ratingMax,
    optionSetId: optionSetId ?? null,
  };

  if (fieldsUnchanged(existing, next)) {
    return existing;
  }

  const maxVersion = await db.questionMaster.aggregate({
    where: { code: existing.code },
    _max: { version: true },
  });

  const created = await db.$transaction(async (tx) => {
    await tx.questionMaster.updateMany({
      where: { code: existing.code, isLatest: true },
      data: { isLatest: false },
    });
    return tx.questionMaster.create({
      data: {
        code: existing.code,
        version: (maxVersion._max.version ?? 0) + 1,
        isLatest: true,
        title: next.title,
        description: next.description,
        questionType: next.questionType,
        requiredDefault: next.requiredDefault,
        placeholder: next.placeholder,
        minValue: next.minValue,
        maxValue: next.maxValue,
        maxLength: next.maxLength,
        ratingMax: next.ratingMax,
        isPublic: existing.isPublic,
        ...(existing.organizationId
          ? { organization: { connect: { id: existing.organizationId } } }
          : {}),
        ...(next.optionSetId
          ? { optionSet: { connect: { id: next.optionSetId } } }
          : {}),
      },
    });
  });
  await tryEmbed(created.id);
  return created;
}

/**
 * Delete a master (all versions). Blocked while any version is referenced by
 * a questionnaire question.
 */
export async function deleteQuestionMaster(id: string): Promise<void> {
  const existing = await db.questionMaster.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Question master not found");
  const used = await db.questionnaireQuestion.count({
    where: { questionMaster: { code: existing.code } },
  });
  if (used > 0) {
    throw new AppError(
      "Cannot delete: this question master is used by questionnaires",
      409,
      "MASTER_IN_USE"
    );
  }
  await db.questionMaster.deleteMany({ where: { code: existing.code } });
}

/**
 * Latest version of every master the viewer can see, ordered by code.
 * TKT-008/TKT-014: visibility filter applied — admins see all (incl. PENDING);
 * operators see the published bank (public/legacy/admin-created/same-org) +
 * their own masters.
 */
export async function listQuestionMasters(viewer?: MasterViewer | null) {
  return db.questionMaster.findMany({
    where: { isLatest: true, ...visibleMasterWhere(viewer) },
    orderBy: { code: "asc" },
    include: {
      optionSet: { include: { options: { orderBy: { order: "asc" } } } },
      creator: { select: { id: true, name: true, role: true } },
    },
  });
}

/** TKT-008: admin publish — PENDING suggestion becomes part of the public bank. */
export async function publishQuestionMaster(id: string) {
  const existing = await db.questionMaster.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Question master not found");
  const updated = await db.questionMaster.update({
    where: { id },
    data: { status: "PUBLISHED" },
  });
  await tryEmbed(id);
  return updated;
}

/** TKT-008: admin reject — a PENDING suggestion is discarded (no bank entry). */
export async function rejectQuestionMaster(id: string) {
  const existing = await db.questionMaster.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Question master not found");
  if (existing.status !== "PENDING") {
    throw new AppError("Only PENDING question masters can be rejected", 409, "NOT_PENDING");
  }
  return db.questionMaster.delete({ where: { id } });
}

/** TKT-008/TKT-014: opt-in public visibility for a PUBLISHED master. */
export async function setQuestionMasterPublic(id: string, isPublic: boolean) {
  const existing = await db.questionMaster.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Question master not found");
  return db.questionMaster.update({ where: { id }, data: { isPublic } });
}

/** All versions of one master, newest first. */
export async function getQuestionMasterHistory(code: string) {
  return db.questionMaster.findMany({
    where: { code },
    orderBy: { version: "desc" },
  });
}

/** Every version of every master (for the admin history view). */
export async function listAllMasterVersions() {
  return db.questionMaster.findMany({
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
}

// ------------------------------------------------------------ option sets

export async function createOptionSet(input: OptionSetInput) {
  if (input.source === "EXTERNAL_API" && !input.apiUrl) {
    throw new AppError("External API option sets require an apiUrl", 422, "API_URL_REQUIRED");
  }
  const existing = await db.optionSet.findFirst({ where: { name: input.name.trim() } });
  if (existing) {
    throw new AppError(
      "An option set with this name already exists — edit it to create a new version",
      409,
      "NAME_TAKEN"
    );
  }

  return db.optionSet.create({
    data: {
      name: input.name.trim(),
      familyId: randomUUID(),
      version: 1,
      isLatest: true,
      source: input.source,
      apiUrl: input.source === "EXTERNAL_API" ? input.apiUrl ?? null : null,
      apiMethod: input.apiMethod ?? "GET",
      apiHeaders: (input.apiHeaders ?? {}) as Prisma.InputJsonValue,
      itemsPath: input.itemsPath ?? null,
      apiLabelKey: input.apiLabelKey ?? null,
      apiValueKey: input.apiValueKey ?? null,
      options: {
        create: (input.options ?? []).map((o, i) => ({
          label: o.label.trim(),
          value: o.value.trim(),
          order: o.order ?? i,
        })),
      },
    },
  });
}

/**
 * Update an option set by creating a NEW immutable version (same family,
 * version + 1) with its own option rows. The previous version — including its
 * options — stays intact. No-op saves do not bump. The name may change
 * (renames are tracked via the stable familyId), but never to a blank string
 * or a name already used by a DIFFERENT family.
 */
export async function updateOptionSet(id: string, input: Partial<OptionSetInput>) {
  const existing = await db.optionSet.findUnique({
    where: { id },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!existing) throw new NotFoundError("Option set not found");

  const source = input.source ?? existing.source;
  const apiUrl = input.apiUrl !== undefined ? input.apiUrl : existing.apiUrl;
  if (source === "EXTERNAL_API" && !apiUrl) {
    throw new AppError("External API option sets require an apiUrl", 422, "API_URL_REQUIRED");
  }

  // Blank/whitespace names fall back to the existing name — never create a
  // version with an empty name.
  const rawName = input.name !== undefined ? input.name.trim() : existing.name;
  const name = rawName || existing.name;

  const familyId = existing.familyId ?? existing.id;
  if (name !== existing.name) {
    const collision = await db.optionSet.findFirst({
      where: { name, familyId: { not: familyId } },
    });
    if (collision) {
      throw new AppError(
        `An option set with the name "${name}" already exists — pick a different name`,
        409,
        "NAME_TAKEN"
      );
    }
  }

  const next = {
    name,
    source,
    apiUrl: source === "EXTERNAL_API" ? apiUrl ?? null : null,
    apiMethod: input.apiMethod !== undefined ? (input.apiMethod ?? "GET") : existing.apiMethod,
    apiHeaders:
      input.apiHeaders !== undefined
        ? (input.apiHeaders ?? {})
        : ((existing.apiHeaders ?? {}) as Record<string, string>),
    itemsPath: input.itemsPath !== undefined ? (input.itemsPath ?? null) : existing.itemsPath,
    apiLabelKey: input.apiLabelKey !== undefined ? (input.apiLabelKey ?? null) : existing.apiLabelKey,
    apiValueKey: input.apiValueKey !== undefined ? (input.apiValueKey ?? null) : existing.apiValueKey,
    options: input.options ?? existing.options.map((o) => ({ label: o.label, value: o.value, order: o.order })),
  };

  if (optionSetUnchanged(existing, next)) {
    return existing;
  }

  const maxVersion = await db.optionSet.aggregate({
    where: { familyId },
    _max: { version: true },
  });

  return db.$transaction(async (tx) => {
    await tx.optionSet.updateMany({
      where: { familyId, isLatest: true },
      data: { isLatest: false },
    });
    return tx.optionSet.create({
      data: {
        name: next.name,
        familyId,
        version: (maxVersion._max.version ?? 0) + 1,
        isLatest: true,
        source: next.source,
        apiUrl: next.apiUrl,
        apiMethod: next.apiMethod,
        apiHeaders: next.apiHeaders as Prisma.InputJsonValue,
        itemsPath: next.itemsPath,
        apiLabelKey: next.apiLabelKey ?? null,
        apiValueKey: next.apiValueKey ?? null,
        options: {
          create: next.options.map((o, i) => ({
            label: o.label.trim(),
            value: o.value.trim(),
            order: o.order ?? i,
          })),
        },
      },
    });
  });
}

/** Delete an option set — the whole family, hard delete. Blocked with a
 * named error while any master or placed question references any version. */
export async function deleteOptionSet(id: string): Promise<void> {
  const existing = await db.optionSet.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Option set not found");
  const familyId = existing.familyId ?? existing.id;
  const versions = await db.optionSet.findMany({
    where: { familyId },
    select: { id: true },
  });
  const versionIds = versions.map((v) => v.id);

  const masters = await db.questionMaster.findMany({
    where: { optionSetId: { in: versionIds } },
    select: { code: true, title: true },
  });
  const usedByQuestion = await db.questionnaireQuestion.count({
    where: { optionSetId: { in: versionIds } },
  });
  if (masters.length > 0 || usedByQuestion > 0) {
    const masterList =
      masters.length > 0
        ? masters.map((m) => `${m.title} (${m.code})`).join(", ")
        : null;
    throw new AppError(
      masterList
        ? `Cannot delete: this option set is used by master question${masters.length > 1 ? "s" : ""} ${masterList}`
        : "Cannot delete: this option set is used by a questionnaire question",
      409,
      "OPTION_SET_IN_USE"
    );
  }
  await db.optionSet.deleteMany({ where: { familyId } });
}

/** Latest version of every option set, ordered by name. */
export async function listOptionSets() {
  return db.optionSet.findMany({
    where: { isLatest: true },
    orderBy: { name: "asc" },
    include: { options: { orderBy: { order: "asc" } } },
  });
}

/** All versions of one option set, newest first. */
export async function getOptionSetHistory(name: string) {
  return db.optionSet.findMany({
    where: { name },
    orderBy: { version: "desc" },
    include: { options: { orderBy: { order: "asc" } } },
  });
}

/** Every version of every option set (for the admin history view). */
export async function listAllOptionSetVersions() {
  return db.optionSet.findMany({
    orderBy: [{ name: "asc" }, { version: "desc" }],
    include: { options: { orderBy: { order: "asc" } } },
  });
}

// ---------------------------------------------------------------- helpers

/** Best-effort embedding for a master version; never blocks master writes. */
async function tryEmbed(masterId: string): Promise<void> {
  try {
    await ensureMasterEmbedding(masterId);
  } catch (err) {
    console.warn("failed to embed question master", masterId, err);
  }
}

function validateMasterFields(input: QuestionMasterInput): void {
  if (CHOICE_TYPES.includes(input.questionType)) {
    if (!input.optionSetId) {
      throw new AppError(
        `Question type ${input.questionType} requires an option set`,
        422,
        "OPTION_SET_REQUIRED"
      );
    }
  } else if (input.optionSetId) {
    throw new AppError(
      `Question type ${input.questionType} cannot have an option set`,
      422,
      "OPTION_SET_NOT_ALLOWED"
    );
  }
}

function fieldsUnchanged(
  existing: { title: string; description: string | null; questionType: QuestionType; requiredDefault: boolean; placeholder: string | null; minValue: number | null; maxValue: number | null; maxLength: number | null; ratingMax: number | null; optionSetId: string | null },
  next: typeof existing
): boolean {
  return (
    existing.title === next.title &&
    existing.description === next.description &&
    existing.questionType === next.questionType &&
    existing.requiredDefault === next.requiredDefault &&
    existing.placeholder === next.placeholder &&
    existing.minValue === next.minValue &&
    existing.maxValue === next.maxValue &&
    existing.maxLength === next.maxLength &&
    existing.ratingMax === next.ratingMax &&
    existing.optionSetId === next.optionSetId
  );
}

function optionSetUnchanged(
  existing: {
    name: string;
    source: "STATIC" | "EXTERNAL_API";
    apiUrl: string | null;
    apiMethod: string | null;
    apiHeaders: unknown;
    itemsPath: string | null;
    options: Array<{ label: string; value: string; order: number }>;
  },
  next: {
    name: string;
    source: "STATIC" | "EXTERNAL_API";
    apiUrl: string | null;
    apiMethod: string | null;
    apiHeaders: Record<string, string>;
    itemsPath: string | null;
    options: Array<{ label: string; value: string; order?: number }>;
  }
): boolean {
  const sameMeta =
    existing.name === next.name &&
    existing.source === next.source &&
    existing.apiUrl === next.apiUrl &&
    existing.apiMethod === next.apiMethod &&
    existing.itemsPath === next.itemsPath &&
    JSON.stringify(existing.apiHeaders ?? {}) === JSON.stringify(next.apiHeaders ?? {});
  if (!sameMeta) return false;
  const a = existing.options.map((o) => `${o.label}|${o.value}|${o.order}`);
  const b = next.options.map((o) => `${o.label}|${o.value}|${o.order ?? 0}`);
  return a.join("\n") === b.join("\n");
}
