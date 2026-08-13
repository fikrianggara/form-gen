import { Prisma } from "@prisma/client";
import type { QuestionnaireStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import type { AggregateConfig, VisibilityRule } from "@/domain/types";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export interface QuestionnaireInput {
  title: string;
  description?: string | null;
  slug: string;
  acceptMultipleResponses?: boolean;
}

export interface AddQuestionInput {
  questionnaireId: string;
  questionMasterId: string;
  required?: boolean;
  visibilityRule?: VisibilityRule | null;
  isRepeatable?: boolean;
  isAggregate?: boolean;
  aggregateConfig?: AggregateConfig | null;
  parentId?: string | null;
  /** Specific OptionSet version to use instead of the master's pinned one. */
  optionSetId?: string | null;
}

export interface UpdateQuestionSettingsInput {
  required?: boolean;
  visibilityRule?: VisibilityRule | null;
  isRepeatable?: boolean;
  isAggregate?: boolean;
  aggregateConfig?: AggregateConfig | null;
}

export async function createQuestionnaire(input: QuestionnaireInput) {
  if (!SLUG_PATTERN.test(input.slug)) {
    throw new AppError(
      "Slug may only contain lowercase letters, numbers and hyphens",
      422,
      "INVALID_SLUG"
    );
  }
  try {
    return await db.questionnaire.create({
      data: {
        title: input.title.trim(),
        description: input.description ?? null,
        slug: input.slug.trim().toLowerCase(),
        acceptMultipleResponses: input.acceptMultipleResponses ?? true,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("A questionnaire with this slug already exists", 409, "SLUG_TAKEN");
    }
    throw err;
  }
}

export async function updateQuestionnaire(
  id: string,
  input: Partial<Omit<QuestionnaireInput, "slug">>
) {
  const existing = await db.questionnaire.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Questionnaire not found");
  return db.questionnaire.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.acceptMultipleResponses !== undefined
        ? { acceptMultipleResponses: input.acceptMultipleResponses }
        : {}),
    },
  });
}

export async function setQuestionnaireStatus(
  id: string,
  status: QuestionnaireStatus
) {
  const existing = await db.questionnaire.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Questionnaire not found");
  return db.questionnaire.update({ where: { id }, data: { status } });
}

export async function listQuestionnaires() {
  return db.questionnaire.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { responses: true, questions: true } } },
  });
}

export function getQuestionnaireWithQuestions(id: string) {
  return db.questionnaire.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: {
          optionSet: { include: { options: { orderBy: { order: "asc" } } } },
          questionMaster: {
            include: {
              optionSet: { include: { options: { orderBy: { order: "asc" } } } },
            },
          },
          children: {
            orderBy: { order: "asc" },
            include: {
              optionSet: { include: { options: { orderBy: { order: "asc" } } } },
              questionMaster: {
                include: {
                  optionSet: { include: { options: { orderBy: { order: "asc" } } } },
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function addQuestion(input: AddQuestionInput) {
  const questionnaire = await db.questionnaire.findUnique({
    where: { id: input.questionnaireId },
  });
  if (!questionnaire) throw new NotFoundError("Questionnaire not found");

  const master = await db.questionMaster.findUnique({
    where: { id: input.questionMasterId },
  });
  if (!master) throw new NotFoundError("Question master not found");

  const parentId: string | null = input.parentId ?? null;
  if (parentId) {
    const parent = await db.questionnaireQuestion.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundError("Parent question not found");
    if (parent.questionnaireId !== input.questionnaireId) {
      throw new AppError(
        "Parent question belongs to a different questionnaire",
        422,
        "PARENT_MISMATCH"
      );
    }
    if (!parent.isRepeatable) {
      throw new AppError(
        "Child questions require a repeatable parent",
        422,
        "PARENT_NOT_REPEATABLE"
      );
    }
  }

  if (input.parentId && input.isRepeatable) {
    throw new AppError(
      "A child question cannot itself be repeatable",
      422,
      "NESTED_REPEATABLE"
    );
  }
  if (input.isAggregate && !input.aggregateConfig) {
    throw new AppError(
      "Aggregate questions require an aggregateConfig",
      422,
      "AGGREGATE_CONFIG_REQUIRED"
    );
  }
  if (input.optionSetId) {
    const optionSet = await db.optionSet.findUnique({ where: { id: input.optionSetId } });
    if (!optionSet) throw new NotFoundError("Option set version not found");
  }

  // Postgres treats NULLs as distinct in unique constraints, so top-level
  // duplicates (parentId NULL) must be caught explicitly.
  const duplicate = await db.questionnaireQuestion.findFirst({
    where: {
      questionnaireId: input.questionnaireId,
      questionMasterId: input.questionMasterId,
      parentId: parentId ?? null,
    },
  });
  if (duplicate) {
    throw new AppError(
      "This question master is already used in this position",
      409,
      "QUESTION_DUPLICATE"
    );
  }

  const maxOrder = await db.questionnaireQuestion.aggregate({
    where: { questionnaireId: input.questionnaireId },
    _max: { order: true },
  });

  const data: Prisma.QuestionnaireQuestionCreateInput = {
    questionnaire: { connect: { id: input.questionnaireId } },
    questionMaster: { connect: { id: input.questionMasterId } },
    order: (maxOrder._max.order ?? 0) + 1,
    required: input.required ?? master.requiredDefault,
    visibilityRule: jsonOrNull(input.visibilityRule),
    isRepeatable: input.isRepeatable ?? false,
    isAggregate: input.isAggregate ?? false,
    aggregateConfig: jsonOrNull(input.aggregateConfig),
    ...(parentId
      ? { parent: { connect: { id: parentId } } }
      : {}),
    ...(input.optionSetId
      ? { optionSet: { connect: { id: input.optionSetId } } }
      : {}),
  };

  try {
    return await db.questionnaireQuestion.create({ data });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        "This question master is already used in this position",
        409,
        "QUESTION_DUPLICATE"
      );
    }
    throw err;
  }
}

export async function updateQuestionSettings(
  questionId: string,
  input: UpdateQuestionSettingsInput
) {
  const existing = await db.questionnaireQuestion.findUnique({ where: { id: questionId } });
  if (!existing) throw new NotFoundError("Question not found");

  if (input.isAggregate === true && !input.aggregateConfig && !existing.aggregateConfig) {
    throw new AppError(
      "Aggregate questions require an aggregateConfig",
      422,
      "AGGREGATE_CONFIG_REQUIRED"
    );
  }
  if (input.isRepeatable === true && existing.parentId) {
    throw new AppError(
      "A child question cannot be repeatable",
      422,
      "NESTED_REPEATABLE"
    );
  }

  return db.questionnaireQuestion.update({
    where: { id: questionId },
    data: {
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(input.visibilityRule !== undefined
        ? { visibilityRule: jsonOrNull(input.visibilityRule) }
        : {}),
      ...(input.isRepeatable !== undefined ? { isRepeatable: input.isRepeatable } : {}),
      ...(input.isAggregate !== undefined ? { isAggregate: input.isAggregate } : {}),
      ...(input.aggregateConfig !== undefined
        ? { aggregateConfig: jsonOrNull(input.aggregateConfig) }
        : {}),
    },
  });
}

/** Re-pin a placed question to a different version of its master. */
export async function updateQuestionMasterVersion(
  questionId: string,
  masterVersionId: string
) {
  const existing = await db.questionnaireQuestion.findUnique({ where: { id: questionId } });
  if (!existing) throw new NotFoundError("Question not found");
  const master = await db.questionMaster.findUnique({ where: { id: masterVersionId } });
  if (!master) throw new NotFoundError("Question master version not found");
  try {
    return await db.questionnaireQuestion.update({
      where: { id: questionId },
      data: { questionMasterId: masterVersionId },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        "This master version is already used in this position",
        409,
        "QUESTION_DUPLICATE"
      );
    }
    throw err;
  }
}

/**
 * Set (or clear, with null) the per-question OptionSet version override.
 * null means the question uses the option set pinned on its master version.
 */
export async function updateQuestionOptionSet(
  questionId: string,
  optionSetId: string | null
) {
  const existing = await db.questionnaireQuestion.findUnique({ where: { id: questionId } });
  if (!existing) throw new NotFoundError("Question not found");
  if (optionSetId) {
    const optionSet = await db.optionSet.findUnique({ where: { id: optionSetId } });
    if (!optionSet) throw new NotFoundError("Option set version not found");
  }
  return db.questionnaireQuestion.update({
    where: { id: questionId },
    data: { optionSetId },
  });
}

/**
 * Deep-copy a questionnaire: new DRAFT with "(copy)" title and a unique slug,
 * recreating every question (order, settings, rules, AI flags, option set
 * overrides) and preserving repeatable parent/child structure.
 */
export async function duplicateQuestionnaire(id: string) {
  const existing = await getQuestionnaireWithQuestions(id);
  if (!existing) throw new NotFoundError("Questionnaire not found");

  const slug = await uniqueSlug(`${existing.slug}-copy`);

  return db.$transaction(async (tx) => {
    const copy = await tx.questionnaire.create({
      data: {
        title: `${existing.title} (copy)`,
        description: existing.description,
        slug,
        status: "DRAFT",
        acceptMultipleResponses: existing.acceptMultipleResponses,
      },
    });

    const idMap = new Map<string, string>();
    for (const q of existing.questions) {
      const created = await tx.questionnaireQuestion.create({
        data: {
          questionnaireId: copy.id,
          questionMasterId: q.questionMasterId,
          order: q.order,
          required: q.required,
          visibilityRule: jsonOrNull(q.visibilityRule),
          isRepeatable: q.isRepeatable,
          isAggregate: q.isAggregate,
          aggregateConfig: jsonOrNull(q.aggregateConfig),
          aiSuggested: q.aiSuggested,
          aiConfidence: q.aiConfidence,
          aiLowConfidence: q.aiLowConfidence,
          optionSetId: q.optionSetId,
        },
      });
      idMap.set(q.id, created.id);
      for (const c of q.children) {
        const child = await tx.questionnaireQuestion.create({
          data: {
            questionnaireId: copy.id,
            questionMasterId: c.questionMasterId,
            order: c.order,
            required: c.required,
            visibilityRule: jsonOrNull(c.visibilityRule),
            isRepeatable: c.isRepeatable,
            isAggregate: c.isAggregate,
            aggregateConfig: jsonOrNull(c.aggregateConfig),
            aiSuggested: c.aiSuggested,
            aiConfidence: c.aiConfidence,
            aiLowConfidence: c.aiLowConfidence,
            optionSetId: c.optionSetId,
            parentId: idMap.get(q.id) ?? null,
          },
        });
        idMap.set(c.id, child.id);
      }
    }

    return {
      questionnaire: copy,
      questionCount: idMap.size,
    };
  });
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (await db.questionnaire.findUnique({ where: { slug } })) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

/** Remove a question; child questions cascade via FK. */
export async function removeQuestion(questionId: string): Promise<void> {
  const existing = await db.questionnaireQuestion.findUnique({ where: { id: questionId } });
  if (!existing) throw new NotFoundError("Question not found");
  await db.questionnaireQuestion.delete({ where: { id: questionId } });
}

/**
 * Reorder questions within a scope. Default scope: top-level questions
 * (parentId null). Pass a parentId to reorder a repeatable group's children.
 */
export async function reorderQuestions(
  questionnaireId: string,
  orderedIds: string[],
  parentId: string | null = null
): Promise<void> {
  const questions = await db.questionnaireQuestion.findMany({
    where: { questionnaireId, parentId },
    select: { id: true },
  });
  const existingIds = new Set(questions.map((q) => q.id));
  if (
    orderedIds.length !== existingIds.size ||
    orderedIds.some((id) => !existingIds.has(id))
  ) {
    throw new AppError(
      "Reorder list must match the scope's questions exactly",
      422,
      "REORDER_MISMATCH"
    );
  }
  await db.$transaction(
    orderedIds.map((id, index) =>
      db.questionnaireQuestion.update({
        where: { id },
        data: { order: index + 1 },
      })
    )
  );
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** Prisma 6 requires DbNull (not JS null) to clear a Json column. */
function jsonOrNull<T>(value: T | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}
