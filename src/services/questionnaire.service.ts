import { Prisma } from "@prisma/client";
import type { QuestionnaireStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import type { AggregateConfig, VisibilityRule, VisibilityRuleClause } from "@/domain/types";
import { validateVisibilityRule, detectVisibilityCycles } from "@/domain/rules/validation";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/** Rule validation (local + global cycle check) scoped to a questionnaire. */
async function validateQuestionnaireRule(
  questionnaireId: string,
  questionId: string | null,
  rule: VisibilityRule | null
): Promise<void> {
  const questions = await db.questionnaireQuestion.findMany({
    where: { questionnaireId },
    select: {
      id: true,
      parentId: true,
      isAggregate: true,
      visibilityRule: true,
    },
  });
  const ids = questions.map((q) => q.id);
  const topLevelIds = new Set(
    questions.filter((q) => !q.parentId && !q.isAggregate).map((q) => q.id)
  );
  const errors = validateVisibilityRule(rule, {
    questionId,
    questionIds: new Set(ids),
    topLevelIds,
  });
  const ruleMap = new Map<string, VisibilityRule | null>();
  for (const q of questions) {
    ruleMap.set(q.id, (q.visibilityRule as VisibilityRule | null) ?? null);
  }
  if (questionId) ruleMap.set(questionId, rule);
  errors.push(...detectVisibilityCycles(ruleMap, new Set(ids)));
  if (errors.length > 0) {
    throw new AppError(
      `Invalid visibility rule: ${errors.join("; ")}`,
      422,
      "INVALID_VISIBILITY_RULE"
    );
  }
}

export interface QuestionnaireInput {
  title: string;
  description?: string | null;
  slug: string;
  acceptMultipleResponses?: boolean;
  /** Sample respondent emails for unique-link distribution (TKT-001). */
  sampleEmails?: string[];
  /** Creator user id (TKT-017); null/absent = legacy unowned. */
  createdBy?: string | null;
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
        sampleEmails: (input.sampleEmails ?? []) as unknown as object,
        createdBy: input.createdBy ?? null,
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
      ...(input.sampleEmails !== undefined
        ? { sampleEmails: input.sampleEmails as unknown as object }
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
      blocks: { orderBy: { order: "asc" } },
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
  if (input.visibilityRule) {
    await validateQuestionnaireRule(input.questionnaireId, null, input.visibilityRule);
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
    return await db.questionnaireQuestion.create({
      data,
      // Include relations so the editor can render the new question
      // immediately (TKT-015) without a page reload.
      include: {
        questionMaster: {
          include: { optionSet: { select: { id: true, name: true } } },
        },
      },
    });
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
  if (input.visibilityRule !== undefined) {
    await validateQuestionnaireRule(existing.questionnaireId, questionId, input.visibilityRule);
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

    // Copy blocks first so questions can reference their copied block.
    const blockIdMap = new Map<string, string>();
    for (const b of existing.blocks ?? []) {
      const created = await tx.questionnaireBlock.create({
        data: {
          questionnaireId: copy.id,
          title: b.title,
          order: b.order,
          entryRule: jsonOrNull(remapVisibilityRule(b.entryRule, new Map())), // placeholder, remapped below
        },
      });
      blockIdMap.set(b.id, created.id);
    }

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
          blockId: q.blockId ? (blockIdMap.get(q.blockId) ?? null) : null,
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

    // Second pass: rewrite rules/aggregates with the COMPLETE id map (a rule
    // may reference a question created later than its owner).
    const allCopied = [
      ...existing.questions,
      ...existing.questions.flatMap((q) => q.children),
    ];
    for (const q of allCopied) {
      await tx.questionnaireQuestion.update({
        where: { id: idMap.get(q.id)! },
        data: {
          visibilityRule: jsonOrNull(remapVisibilityRule(q.visibilityRule, idMap)),
          aggregateConfig: jsonOrNull(remapAggregateConfig(q.aggregateConfig, idMap)),
        },
      });
    }
    // Block entry rules also reference question ids — remap them too.
    for (const b of existing.blocks ?? []) {
      const copiedBlockId = blockIdMap.get(b.id);
      if (!copiedBlockId) continue;
      await tx.questionnaireBlock.update({
        where: { id: copiedBlockId },
        data: { entryRule: jsonOrNull(remapVisibilityRule(b.entryRule, idMap)) },
      });
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

/** Remap a copied visibility rule's dependency ids through the copy id map. */
function remapVisibilityRule(rule: unknown, idMap: Map<string, string>): unknown {
  if (!rule || typeof rule !== "object") return rule;
  const r = rule as VisibilityRule;
  const remapClause = (clause: VisibilityRuleClause) => ({
    ...clause,
    dependsOnQuestionId: idMap.get(clause.dependsOnQuestionId) ?? clause.dependsOnQuestionId,
  });
  if (Array.isArray(r.sets)) {
    return { ...r, sets: r.sets.map((s) => ({ ...s, rules: s.rules.map(remapClause) })) };
  }
  if (Array.isArray(r.rules)) {
    return { ...r, rules: r.rules.map(remapClause) };
  }
  return r;
}

/** Remap a copied aggregate config's source question id through the copy id map. */
function remapAggregateConfig(agg: unknown, idMap: Map<string, string>): unknown {
  if (!agg || typeof agg !== "object") return agg;
  const a = agg as AggregateConfig;
  if (!a.sourceQuestionId) return a;
  return { ...a, sourceQuestionId: idMap.get(a.sourceQuestionId) ?? a.sourceQuestionId };
}

// ------------------------------------------------------------------ blocks

export async function createBlock(questionnaireId: string, title: string) {
  const q = await db.questionnaire.findUnique({ where: { id: questionnaireId } });
  if (!q) throw new NotFoundError("Questionnaire not found");
  const max = await db.questionnaireBlock.aggregate({
    where: { questionnaireId },
    _max: { order: true },
  });
  return db.questionnaireBlock.create({
    data: { questionnaireId, title: title.trim(), order: (max._max.order ?? 0) + 1 },
  });
}

export async function updateBlock(
  id: string,
  input: { title?: string; entryRule?: VisibilityRule | null }
) {
  const existing = await db.questionnaireBlock.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Block not found");
  if (input.entryRule !== undefined) {
    await validateQuestionnaireRule(existing.questionnaireId, null, input.entryRule);
  }
  return db.questionnaireBlock.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.entryRule !== undefined ? { entryRule: jsonOrNull(input.entryRule) } : {}),
    },
  });
}

export async function deleteBlock(id: string) {
  const existing = await db.questionnaireBlock.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Block not found");
  await db.questionnaireBlock.delete({ where: { id } }); // questions get blockId = null
}

export async function reorderBlocks(questionnaireId: string, orderedIds: string[]) {
  const blocks = await db.questionnaireBlock.findMany({
    where: { questionnaireId },
    select: { id: true },
  });
  if (orderedIds.length !== blocks.length) {
    throw new AppError("Block list mismatch", 422, "BLOCK_REORDER_MISMATCH");
  }
  await db.$transaction(
    orderedIds.map((id, index) =>
      db.questionnaireBlock.update({ where: { id }, data: { order: index + 1 } })
    )
  );
}

export async function setQuestionBlock(questionId: string, blockId: string | null) {
  const question = await db.questionnaireQuestion.findUnique({
    where: { id: questionId },
    include: { block: true },
  });
  if (!question) throw new NotFoundError("Question not found");
  if (blockId) {
    const block = await db.questionnaireBlock.findUnique({ where: { id: blockId } });
    if (!block || block.questionnaireId !== question.questionnaireId) {
      throw new AppError("Block does not belong to this questionnaire", 422, "BLOCK_MISMATCH");
    }
  }
  return db.questionnaireQuestion.update({
    where: { id: questionId },
    data: { blockId },
  });
}

/** Blocks of a questionnaire, ordered. */
export function listBlocks(questionnaireId: string) {
  return db.questionnaireBlock.findMany({
    where: { questionnaireId },
    orderBy: { order: "asc" },
  });
}
