import type { QuestionType } from "@prisma/client";
import { db } from "@/lib/db";
import { getQuestionnaireWithQuestions } from "@/services/questionnaire.service";
import { extractAnswerValue, isAnswerEmpty } from "@/domain/answers";
import type { AnswerValue } from "@/domain/types";
import {
  buildChoiceDistribution,
  computeCompletionStats,
  computeNumericStats,
  dailyResponseCounts,
} from "@/domain/reporting/stats";
import type {
  ChoiceStat,
  CompletionStats,
  DailyCount,
  NumericStat,
} from "@/domain/reporting/stats";
import { buildExportTable } from "@/domain/reporting/export";
import type {
  ExportAnswer,
  ExportColumn,
  ExportQuestion,
  ExportResponse,
  LongRow,
} from "@/domain/reporting/export";

// ------------------------------------------------------------- shared types

type QuestionTree = NonNullable<Awaited<ReturnType<typeof getQuestionnaireWithQuestions>>>;
type ResponseWithAnswers = Awaited<ReturnType<typeof loadResponses>>[number];

const CHOICE_TYPES = new Set<QuestionType>(["RADIO", "CHECKBOX", "SELECT"]);

interface FlatQuestion {
  id: string;
  code: string;
  title: string;
  questionType: QuestionType;
  parentId: string | null;
  isRepeatable: boolean;
  isAggregate: boolean;
  required: boolean;
  /** Defaults to 5 when the master carries no ratingMax. */
  ratingMax: number;
  options: Array<{ label: string; value: string }> | null;
}

/** Structural view of a questionnaire question node (with its master). */
interface QuestionNode {
  id: string;
  parentId: string | null;
  required: boolean;
  isRepeatable: boolean;
  isAggregate: boolean;
  questionMaster: {
    code: string;
    title: string;
    questionType: QuestionType;
    ratingMax: number | null;
    optionSet?: {
      source: string;
      options: Array<{ label: string; value: string }>;
    } | null;
  };
}

/** A top-level tree node additionally carries its child nodes. */
interface TreeQuestionNode extends QuestionNode {
  children: QuestionNode[];
}

export interface QuestionStat {
  questionId: string;
  code: string;
  title: string;
  groupTitle: string | null;
  questionType: QuestionType;
  required: boolean;
  isAggregate: boolean;
  /** Responses with at least one non-empty answer (children: at least one row). */
  answeredCount: number;
  /** Total non-empty answer values (children: total rows). */
  rowCount: number;
  /** answeredCount / total responses, rounded percent. */
  responseRate: number;
  numeric: NumericStat | null;
  distribution: ChoiceStat[] | null;
}

export interface ReportData {
  questionnaire: { id: string; title: string; slug: string; status: string };
  totals: CompletionStats;
  daily: DailyCount[];
  questions: QuestionStat[];
}

export interface ExportPayload {
  questionnaire: { id: string; title: string; slug: string; exportedAt: string };
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  longRows: LongRow[];
}

// ------------------------------------------------------------- report

export async function getQuestionnaireReport(
  questionnaireId: string
): Promise<ReportData | null> {
  const tree = await getQuestionnaireWithQuestions(questionnaireId);
  if (!tree) return null;

  const responses = await loadResponses(questionnaireId);
  const flat = flattenQuestions(tree);

  return {
    questionnaire: { id: tree.id, title: tree.title, slug: tree.slug, status: tree.status },
    totals: computeCompletionStats(responses),
    daily: dailyResponseCounts(responses),
    questions: buildQuestionStats(flat, responses),
  };
}

// ------------------------------------------------------------- export

export async function getExportPayload(slug: string): Promise<ExportPayload | null> {
  const questionnaire = await db.questionnaire.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!questionnaire) return null;

  const tree = await getQuestionnaireWithQuestions(questionnaire.id);
  if (!tree) return null;

  const responses = await loadResponses(questionnaire.id);
  const flat = flattenQuestions(tree);
  const exportQuestions: ExportQuestion[] = flat.map((q) => ({
    id: q.id,
    code: q.code,
    title: q.title,
    questionType: q.questionType,
    parentId: q.parentId,
    isRepeatable: q.isRepeatable,
  }));
  const byId = new Map(exportQuestions.map((q) => [q.id, q]));

  const table = buildExportTable(exportQuestions, toExportResponses(responses, byId));

  return {
    questionnaire: {
      id: tree.id,
      title: tree.title,
      slug: tree.slug,
      exportedAt: new Date().toISOString(),
    },
    columns: table.columns,
    rows: table.rows,
    longRows: table.longRows,
  };
}

// ------------------------------------------------------------- helpers

async function loadResponses(questionnaireId: string) {
  return db.response.findMany({
    where: { questionnaireId },
    orderBy: { createdAt: "asc" },
    include: {
      answers: true,
      answerGroups: { include: { answers: true } },
    },
  });
}

function flattenQuestions(tree: QuestionTree): FlatQuestion[] {
  const out: FlatQuestion[] = [];
  // Prisma's include type hides base model fields from property access, so we
  // view the nodes through our structural interface (runtime shape matches the
  // include exactly; the double cast is a TS overlap escape hatch).
  for (const q of tree.questions as unknown as TreeQuestionNode[]) {
    if (q.parentId !== null) continue; // children are emitted via their parent
    out.push(toFlatQuestion(q));
    for (const c of q.children) out.push(toFlatQuestion(c));
  }
  return out;
}

function toFlatQuestion(q: QuestionNode): FlatQuestion {
  const isChoice = CHOICE_TYPES.has(q.questionMaster.questionType);
  const options =
    isChoice && q.questionMaster.optionSet?.source === "STATIC"
      ? q.questionMaster.optionSet.options.map((o) => ({ label: o.label, value: o.value }))
      : isChoice
        ? []
        : null;
  return {
    id: q.id,
    code: q.questionMaster.code,
    title: q.questionMaster.title,
    questionType: q.questionMaster.questionType,
    parentId: q.parentId,
    isRepeatable: q.isRepeatable,
    isAggregate: q.isAggregate,
    required: q.required,
    ratingMax: q.questionMaster.ratingMax ?? 5,
    options,
  };
}

function buildQuestionStats(
  flat: FlatQuestion[],
  responses: ResponseWithAnswers[]
): QuestionStat[] {
  const total = responses.length;
  const stats: QuestionStat[] = [];

  for (const q of flat) {
    if (q.isRepeatable) continue; // group headers are containers, not fields

    let answeredResponses = 0;
    const values: AnswerValue[] = [];
    for (const r of responses) {
      const nonEmpty = collectAnswerValues(r, q).filter(
        (v) => !isAnswerEmpty(q.questionType, v)
      );
      if (nonEmpty.length > 0) answeredResponses++;
      values.push(...nonEmpty);
    }

    const numeric =
      q.questionType === "NUMBER" || q.questionType === "RATING"
        ? computeNumericStats(values as Array<number | null>)
        : null;

    let distribution: ChoiceStat[] | null = null;
    if (q.questionType === "RADIO" || q.questionType === "SELECT" || q.questionType === "CHECKBOX") {
      distribution = buildChoiceDistribution(values, q.options);
    } else if (q.questionType === "RATING") {
      const scale = Array.from({ length: q.ratingMax }, (_, i) => ({
        label: String(i + 1),
        value: String(i + 1),
      }));
      distribution = buildChoiceDistribution(values, scale);
    }

    stats.push({
      questionId: q.id,
      code: q.code,
      title: q.title,
      groupTitle: q.parentId ? findGroupTitle(flat, q.parentId) : null,
      questionType: q.questionType,
      required: q.required,
      isAggregate: q.isAggregate,
      answeredCount: answeredResponses,
      rowCount: values.length,
      responseRate: total === 0 ? 0 : Math.round((answeredResponses / total) * 100),
      numeric,
      distribution,
    });
  }
  return stats;
}

function findGroupTitle(flat: FlatQuestion[], parentId: string): string | null {
  return flat.find((q) => q.id === parentId)?.title ?? null;
}

/** Non-empty answer values for one question across a response (no double counting). */
function collectAnswerValues(r: ResponseWithAnswers, q: FlatQuestion): AnswerValue[] {
  const out: AnswerValue[] = [];
  if (q.parentId === null) {
    for (const a of r.answers) {
      if (a.questionId !== q.id || a.answerGroupId) continue;
      const v = extractAnswerValue(q.questionType, a);
      if (v !== null) out.push(v);
    }
  } else {
    for (const g of r.answerGroups) {
      for (const a of g.answers) {
        if (a.questionId !== q.id) continue;
        const v = extractAnswerValue(q.questionType, a);
        if (v !== null) out.push(v);
      }
    }
  }
  return out;
}

function toExportResponses(
  responses: ResponseWithAnswers[],
  questionById: Map<string, ExportQuestion>
): ExportResponse[] {
  return responses.map((r) => ({
    id: r.id,
    respondentLabel: r.respondentLabel,
    status: r.status,
    progress: r.progress,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    answers: buildExportAnswers(r, questionById),
  }));
}

function buildExportAnswers(
  r: ResponseWithAnswers,
  questionById: Map<string, ExportQuestion>
): ExportAnswer[] {
  const out: ExportAnswer[] = [];
  const typeOf = (id: string): QuestionType => questionById.get(id)?.questionType ?? "TEXT";

  for (const a of r.answers) {
    if (a.answerGroupId) continue; // group rows are emitted via answerGroups
    const v = extractAnswerValue(typeOf(a.questionId), a);
    if (v === null) continue;
    out.push({ questionId: a.questionId, groupParentId: null, rowIndex: null, value: v });
  }
  for (const g of r.answerGroups) {
    for (const a of g.answers) {
      const v = extractAnswerValue(typeOf(a.questionId), a);
      if (v === null) continue;
      out.push({
        questionId: a.questionId,
        groupParentId: g.parentQuestionId,
        rowIndex: g.rowIndex,
        value: v,
      });
    }
  }
  return out;
}
