/**
 * Pure builders for response export tables (wide + long format).
 *
 * The wide table has one row per response with one column per question;
 * repeatable-group children become columns labelled "<Group> → <Child>" whose
 * value joins the child's row values with "; ". The long table is lossless:
 * one row per answer, tagged with group title and row index.
 */
import type { QuestionType } from "@prisma/client";
import type { AnswerValue } from "@/domain/types";

export interface ExportQuestion {
  id: string;
  code: string;
  title: string;
  questionType: QuestionType;
  parentId: string | null;
  isRepeatable: boolean;
}

export interface ExportAnswer {
  questionId: string;
  /** Parent question id when the answer lives in a repeatable group row. */
  groupParentId: string | null;
  rowIndex: number | null;
  value: AnswerValue;
}

export interface ExportResponse {
  id: string;
  respondentLabel: string | null;
  status: string;
  progress: number;
  completedAt: string | null;
  createdAt: string;
  answers: ExportAnswer[];
}

export interface ExportColumn {
  key: string;
  label: string;
  kind: "meta" | "question";
  questionType: QuestionType | null;
}

export interface LongRow {
  responseId: string;
  respondentLabel: string | null;
  status: string;
  progress: number;
  createdAt: string;
  completedAt: string | null;
  questionKey: string;
  questionCode: string;
  questionTitle: string;
  questionType: QuestionType;
  groupTitle: string | null;
  rowIndex: number | null;
  value: AnswerValue;
}

export interface ExportTable {
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  longRows: LongRow[];
}

/** Render an answer value for cells / joins (arrays -> "a, b"). */
export function stringifyValue(value: AnswerValue): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

export function buildExportTable(
  questions: ExportQuestion[],
  responses: ExportResponse[]
): ExportTable {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const topLevel = questions.filter((q) => q.parentId === null);
  const children = questions.filter((q) => q.parentId !== null);

  const metaColumns: ExportColumn[] = [
    { key: "responseId", label: "Response ID", kind: "meta", questionType: null },
    { key: "respondentLabel", label: "Respondent", kind: "meta", questionType: null },
    { key: "status", label: "Status", kind: "meta", questionType: null },
    { key: "progress", label: "Progress (%)", kind: "meta", questionType: null },
    { key: "completedAt", label: "Completed At", kind: "meta", questionType: null },
    { key: "createdAt", label: "Created At", kind: "meta", questionType: null },
  ];

  const questionColumns: ExportColumn[] = topLevel
    .filter((q) => !q.isRepeatable)
    .map((q) => ({
      key: q.id,
      label: q.title,
      kind: "question" as const,
      questionType: q.questionType,
    }));
  for (const child of children) {
    const parent = child.parentId ? byId.get(child.parentId) : undefined;
    questionColumns.push({
      key: child.id,
      label: parent ? `${parent.title} → ${child.title}` : child.title,
      kind: "question",
      questionType: child.questionType,
    });
  }
  const columns = [...metaColumns, ...questionColumns];

  const rows = responses.map((r) => {
    const row: Record<string, unknown> = {
      responseId: r.id,
      respondentLabel: r.respondentLabel,
      status: r.status,
      progress: r.progress,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
    };
    const valuesByQuestion = new Map<string, AnswerValue[]>();
    for (const a of r.answers) {
      if (a.value === null || a.value === undefined) continue;
      const list = valuesByQuestion.get(a.questionId) ?? [];
      list.push(a.value);
      valuesByQuestion.set(a.questionId, list);
    }
    for (const col of questionColumns) {
      const values = valuesByQuestion.get(col.key) ?? [];
      row[col.key] =
        values.length === 0
          ? null
          : values.length === 1
            ? values[0]
            : values.map(stringifyValue).join("; ");
    }
    return row;
  });

  const longRows: LongRow[] = [];
  for (const r of responses) {
    for (const a of r.answers) {
      if (a.value === null || a.value === undefined) continue;
      const q = byId.get(a.questionId);
      if (!q) continue;
      const groupTitle = a.groupParentId ? byId.get(a.groupParentId)?.title ?? null : null;
      longRows.push({
        responseId: r.id,
        respondentLabel: r.respondentLabel,
        status: r.status,
        progress: r.progress,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        questionKey: a.questionId,
        questionCode: q.code,
        questionTitle: q.title,
        questionType: q.questionType,
        groupTitle,
        rowIndex: a.rowIndex,
        value: a.value,
      });
    }
  }

  return { columns, rows, longRows };
}
