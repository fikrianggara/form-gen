import type { Prisma, QuestionType, ResponseStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { evaluateVisibility } from "@/domain/rules/visibility";
import { computeAggregate } from "@/domain/rules/aggregate";
import { calculateProgress } from "@/domain/rules/progress";
import { extractAnswerValue, isAnswerEmpty } from "@/domain/answers";
import type { AggregateConfig, AnswerValue, VisibilityRule } from "@/domain/types";
import { getQuestionnaireWithQuestions } from "@/services/questionnaire.service";

export interface AnswerInput {
  questionId: string;
  value: string | number | string[] | null;
}

export interface GroupInput {
  parentQuestionId: string;
  rows: AnswerInput[][];
}

export interface SaveResponseInput {
  status?: ResponseStatus;
  answers?: AnswerInput[];
  groups?: GroupInput[];
  respondentLabel?: string | null;
}

interface QuestionMeta {
  id: string;
  questionType: QuestionType;
  required: boolean;
  isRepeatable: boolean;
  isAggregate: boolean;
  aggregateConfig: AggregateConfig | null;
  visibilityRule: VisibilityRule | null;
  parentId: string | null;
}

function assertActive(q: { status: string }): void {
  if (q.status !== "ACTIVE") {
    throw new AppError(
      "Questionnaire must be ACTIVE to accept responses",
      409,
      "QUESTIONNAIRE_NOT_ACTIVE"
    );
  }
}

// ------------------------------------------------------------- lifecycle

export async function createResponse(
  questionnaireId: string,
  respondentToken: string,
  respondentLabel?: string | null
) {
  const q = await db.questionnaire.findUnique({ where: { id: questionnaireId } });
  if (!q) throw new NotFoundError("Questionnaire not found");
  assertActive(q);

  if (!q.acceptMultipleResponses) {
    const existing = await db.response.findFirst({
      where: { questionnaireId, respondentToken },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
  }

  return db.response.create({
    data: {
      questionnaireId,
      respondentToken,
      respondentLabel: respondentLabel ?? null,
      status: "DRAFT",
      progress: 0,
    },
  });
}

export async function getResponseForToken(questionnaireId: string, respondentToken: string) {
  return db.response.findFirst({
    where: { questionnaireId, respondentToken },
    orderBy: { createdAt: "desc" },
  });
}

export async function listResponses(questionnaireId: string) {
  return db.response.findMany({
    where: { questionnaireId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { answers: true, answerGroups: true } } },
  });
}

export async function getResponseDetail(responseId: string) {
  return db.response.findUnique({
    where: { id: responseId },
    include: {
      questionnaire: { select: { id: true, title: true, slug: true } },
      answers: {
        include: { question: { include: { questionMaster: true } } },
        orderBy: { createdAt: "asc" },
      },
      answerGroups: {
        orderBy: { rowIndex: "asc" },
        include: {
          question: { include: { questionMaster: true } },
          answers: {
            include: { question: { include: { questionMaster: true } } },
          },
        },
      },
    },
  });
}

// ------------------------------------------------------------ save logic

export async function saveResponse(responseId: string, input: SaveResponseInput) {
  const response = await db.response.findUnique({ where: { id: responseId } });
  if (!response) throw new NotFoundError("Response not found");
  if (response.status === "COMPLETED") {
    throw new AppError(
      "This response is already completed and can no longer be edited",
      409,
      "RESPONSE_COMPLETED"
    );
  }

  const tree = await getQuestionnaireWithQuestions(response.questionnaireId);
  if (!tree) throw new NotFoundError("Questionnaire not found");
  assertActive(tree);

  const meta = buildMeta(tree.questions);
  const metaMap = new Map(meta.map((m) => [m.id, m]));
  const flatAnswers = buildFlatAnswers(input.answers ?? [], input.groups ?? []);
  const groupRows = buildGroupRows(input.groups ?? [], metaMap);

  // Visibility: evaluate top-level questions in order; children inherit parent.
  const topLevel = meta.filter((m) => m.parentId === null);
  const visibleIds = new Set<string>();
  for (const q of topLevel) {
    const visible = evaluateVisibility(q.visibilityRule, flatAnswers);
    if (visible) {
      visibleIds.add(q.id);
      for (const child of meta.filter((m) => m.parentId === q.id)) {
        visibleIds.add(child.id);
      }
    }
  }

  // Required validation (only visible questions count).
  const missing: string[] = [];
  for (const q of meta) {
    if (!q.required || !visibleIds.has(q.id)) continue;
    if (q.isAggregate) continue; // computed values are filled by the server
    if (q.isRepeatable) continue; // group headers are containers, not fields
    const answered = isQuestionAnswered(q, flatAnswers, groupRows);
    if (!answered) missing.push(q.id);
  }
  if (input.status === "COMPLETED" && missing.length > 0) {
    const labels = missing.map((id) => meta.find((m) => m.id === id)?.id ?? id);
    throw new AppError(
      `Required questions are missing an answer: ${labels.join(", ")}`,
      422,
      "REQUIRED_MISSING"
    );
  }

  // Computed (aggregate) answers.
  const computed: Array<{ questionId: string; value: number }> = [];
  for (const q of meta) {
    if (!q.isAggregate || !visibleIds.has(q.id) || !q.aggregateConfig) continue;
    const value = resolveAggregate(q.aggregateConfig, metaMap, flatAnswers, groupRows);
    if (value !== null) computed.push({ questionId: q.id, value });
  }

  // Progress: percentage of required visible questions answered.
  const requiredVisible = meta.filter(
    (m) => m.required && visibleIds.has(m.id) && !m.isAggregate && !m.isRepeatable
  );
  const answeredSet = new Set<string>();
  for (const q of requiredVisible) {
    if (isQuestionAnswered(q, flatAnswers, groupRows)) answeredSet.add(q.id);
  }
  const progress = calculateProgress(
    requiredVisible.map((m) => m.id),
    answeredSet
  );

  const completed = input.status === "COMPLETED";
  await db.$transaction(async (tx) => {
    await tx.answer.deleteMany({ where: { responseId } });
    await tx.answerGroup.deleteMany({ where: { responseId } });

    for (const [parentId, rows] of groupRows) {
      for (let i = 0; i < rows.length; i++) {
        const group = await tx.answerGroup.create({
          data: {
            responseId,
            parentQuestionId: parentId,
            rowIndex: i,
          },
        });
        for (const row of rows[i]) {
          if (row.value === null || row.value === undefined) continue;
          const data = valueToColumns(metaMap.get(row.questionId)?.questionType ?? "TEXT", row.value);
          if (data === null) continue;
          await tx.answer.create({
            data: { responseId, questionId: row.questionId, answerGroupId: group.id, ...data },
          });
        }
      }
    }

    for (const a of input.answers ?? []) {
      if (a.value === null || a.value === undefined) continue;
      const type = metaMap.get(a.questionId)?.questionType ?? "TEXT";
      const data = valueToColumns(type, a.value);
      if (data === null) continue;
      await tx.answer.create({
        data: { responseId, questionId: a.questionId, ...data },
      });
    }

    for (const c of computed) {
      await tx.answer.create({
        data: { responseId, questionId: c.questionId, numberValue: c.value, isComputed: true },
      });
    }

    await tx.response.update({
      where: { id: responseId },
      data: {
        status: completed ? "COMPLETED" : "DRAFT",
        progress,
        completedAt: completed ? new Date() : null,
        ...(input.respondentLabel !== undefined
          ? { respondentLabel: input.respondentLabel ?? null }
          : {}),
      },
    });
  });

  return db.response.findUnique({ where: { id: responseId } });
}

// ------------------------------------------------------------- config

export async function getQuestionnaireConfig(slug: string) {
  const q = await db.questionnaire.findUnique({ where: { slug } });
  if (!q) return null;
  const tree = await getQuestionnaireWithQuestions(q.id);
  if (!tree) return null;

  return {
    id: tree.id,
    title: tree.title,
    description: tree.description,
    slug: tree.slug,
    status: tree.status,
    acceptMultipleResponses: tree.acceptMultipleResponses,
    questions: tree.questions.map((qq) => {
      const master = qq.questionMaster;
      const isChoice = ["RADIO", "CHECKBOX", "SELECT"].includes(master.questionType);
      const optionSet = master.optionSet;
      return {
        id: qq.id,
        order: qq.order,
        required: qq.required,
        isRepeatable: qq.isRepeatable,
        isAggregate: qq.isAggregate,
        aggregateConfig: qq.aggregateConfig as AggregateConfig | null,
        visibilityRule: qq.visibilityRule as VisibilityRule | null,
        parentId: qq.parentId,
        questionMaster: {
          id: master.id,
          code: master.code,
          title: master.title,
          description: master.description,
          questionType: master.questionType,
          placeholder: master.placeholder,
          minValue: master.minValue,
          maxValue: master.maxValue,
          maxLength: master.maxLength,
          ratingMax: master.ratingMax,
        },
        options: isChoice
          ? {
              external: optionSet?.source === "EXTERNAL_API",
              optionSetId: optionSet?.id ?? null,
              items:
                optionSet?.source === "STATIC"
                  ? optionSet.options.map((o) => ({ label: o.label, value: o.value }))
                  : [],
            }
          : null,
      };
    }),
  };
}

// -------------------------------------------------------------- helpers

function buildMeta(
  questions: NonNullable<
    Awaited<ReturnType<typeof getQuestionnaireWithQuestions>>
  >["questions"]
): QuestionMeta[] {
  // The flat list contains children too; only top-level questions carry
  // children relations, so filter first to avoid duplicates.
  const meta: QuestionMeta[] = [];
  for (const q of questions.filter((x) => x.parentId === null)) {
    meta.push({
      id: q.id,
      questionType: q.questionMaster.questionType,
      required: q.required,
      isRepeatable: q.isRepeatable,
      isAggregate: q.isAggregate,
      aggregateConfig: (q.aggregateConfig as AggregateConfig | null) ?? null,
      visibilityRule: (q.visibilityRule as VisibilityRule | null) ?? null,
      parentId: q.parentId,
    });
    for (const c of q.children) {
      meta.push({
        id: c.id,
        questionType: c.questionMaster.questionType,
        required: c.required,
        isRepeatable: c.isRepeatable,
        isAggregate: c.isAggregate,
        aggregateConfig: (c.aggregateConfig as AggregateConfig | null) ?? null,
        visibilityRule: (c.visibilityRule as VisibilityRule | null) ?? null,
        parentId: c.parentId,
      });
    }
  }
  return meta;
}

function buildFlatAnswers(
  answers: AnswerInput[],
  groups: GroupInput[]
): Record<string, AnswerValue> {
  const map: Record<string, AnswerValue> = {};
  for (const a of answers) map[a.questionId] = a.value;
  for (const g of groups) {
    for (const row of g.rows) {
      for (const a of row) {
        if (map[a.questionId] === undefined) map[a.questionId] = a.value;
      }
    }
  }
  return map;
}

function buildGroupRows(
  groups: GroupInput[],
  meta: Map<string, QuestionMeta>
): Map<string, Array<Array<AnswerInput>>> {
  const rows = new Map<string, Array<Array<AnswerInput>>>();
  for (const g of groups) {
    const parent = meta.get(g.parentQuestionId);
    if (!parent) throw new AppError("Unknown repeatable parent question", 422, "UNKNOWN_PARENT");
    if (!parent.isRepeatable) {
      throw new AppError("Groups can only attach to repeatable questions", 422, "NOT_REPEATABLE");
    }
    rows.set(g.parentQuestionId, g.rows);
  }
  return rows;
}

function isQuestionAnswered(
  q: QuestionMeta,
  flat: Record<string, AnswerValue>,
  groups: Map<string, Array<Array<AnswerInput>>>
): boolean {
  if (q.parentId === null) {
    return !isAnswerEmpty(q.questionType, flat[q.id] ?? null);
  }
  const rows = groups.get(q.parentId) ?? [];
  for (const row of rows) {
    const answer = row.find((a) => a.questionId === q.id);
    if (answer && !isAnswerEmpty(q.questionType, answer.value)) return true;
  }
  return false;
}

function resolveAggregate(
  config: AggregateConfig,
  meta: Map<string, QuestionMeta>,
  flat: Record<string, AnswerValue>,
  groups: Map<string, Array<Array<AnswerInput>>>
): number | null {
  const source = meta.get(config.sourceQuestionId);
  if (!source) return null;
  if (source.parentId === null) {
    const value = flat[config.sourceQuestionId] ?? null;
    const numeric = typeof value === "number" ? value : null;
    return computeAggregate(config, { [config.sourceQuestionId]: [numeric] });
  }
  const rows = groups.get(source.parentId) ?? [];
  const values = rows.map((row) => {
    const answer = row.find((a) => a.questionId === config.sourceQuestionId);
    return typeof answer?.value === "number" ? answer.value : null;
  });
  return computeAggregate(config, { [config.sourceQuestionId]: values });
}

/** Map an AnswerValue to Prisma Answer column values for a question type. */
type AnswerColumns = Partial<
  Pick<
    Prisma.AnswerUncheckedCreateInput,
    "textValue" | "numberValue" | "dateValue" | "jsonValue"
  >
>;

function valueToColumns(
  questionType: QuestionType,
  value: string | number | string[]
): AnswerColumns | null {
  if (value === null || value === undefined) return null;
  switch (questionType) {
    case "NUMBER":
    case "RATING": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isNaN(n) ? null : { numberValue: n };
    }
    case "DATE": {
      const s = String(value);
      const d = new Date(`${s}T00:00:00.000Z`);
      return Number.isNaN(d.getTime()) ? null : { dateValue: d };
    }
    case "CHECKBOX": {
      if (!Array.isArray(value)) return null;
      return { jsonValue: value.map(String) as Prisma.InputJsonValue };
    }
    case "TEXT":
    case "TEXTAREA":
    case "RADIO":
    case "SELECT":
    default:
      return { textValue: String(value) };
  }
}

export { extractAnswerValue };
