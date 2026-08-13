"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ConfigQuestion,
  QuestionnaireConfig,
  ResponseDto,
} from "@/lib/types";
import type { AnswerValue } from "@/domain/types";
import { evaluateVisibility } from "@/domain/rules/visibility";
import { sumValues } from "@/domain/rules/aggregate";
import { extractAnswerValue } from "@/domain/answers";
import { Button, Card, ProgressBar, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";

interface ExternalOptions {
  [optionSetId: string]: Array<{ label: string; value: string }>;
}

type FlatAnswers = Record<string, AnswerValue>;
type GroupRows = Record<string, Array<FlatAnswers>>;

function getToken(): string {
  const key = "fg_respondent_token";
  if (typeof window === "undefined") return "";
  let token = window.localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(key, token);
  }
  return token;
}

export default function FormRenderer({ slug }: { slug: string }) {
  const toast = useToast();
  const [config, setConfig] = useState<QuestionnaireConfig | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [status, setStatus] = useState<"DRAFT" | "COMPLETED">("DRAFT");
  const [answers, setAnswers] = useState<FlatAnswers>({});
  const [groups, setGroups] = useState<GroupRows>({});
  const [external, setExternal] = useState<ExternalOptions>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Bootstrap: fetch config, ensure a response, prefill saved answers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getToken();
        const configRes = await fetch(`/api/questionnaires/${slug}`);
        if (!configRes.ok) {
          const body = await configRes.json().catch(() => null);
          const message = body?.error?.message ?? "This questionnaire is unavailable.";
          if (!cancelled) {
            setError(message);
            toast.error("Could not load form", message);
          }
          return;
        }
        const { questionnaire } = await configRes.json();
        if (cancelled) return;
        setConfig(questionnaire);

        const created = await fetch(`/api/questionnaires/${slug}/responses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!created.ok) {
          const body = await created.json().catch(() => null);
          const message = body?.error?.message ?? "Could not start a response.";
          if (!cancelled) {
            setError(message);
            toast.error("Could not start response", message);
          }
          return;
        }
        const { response } = await created.json();
        if (cancelled) return;
        setResponseId(response.id);
        setStatus(response.status);

        if (response.status === "COMPLETED") {
          setSubmitted(true);
          return;
        }

        // Prefill saved draft.
        const resume = await fetch(
          `/api/questionnaires/${slug}/responses?token=${encodeURIComponent(token)}`
        );
        if (resume.ok) {
          const { response: detail }: { response: ResponseDto | null } = await resume.json();
          if (detail && !cancelled) {
            applyPrefill(detail, questionnaire, setAnswers, setGroups);
          }
        }
      } catch {
        if (!cancelled) {
          setError("Network error while loading the form.");
          toast.error("Network error", "Could not reach the server while loading.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, toast]);

  // Fetch external option lists for questions backed by an API option set.
  useEffect(() => {
    if (!config) return;
    const externalIds = new Set<string>();
    for (const q of config.questions) {
      if (q.options?.external && q.options.optionSetId) {
        externalIds.add(q.options.optionSetId);
      }
    }
    for (const id of externalIds) {
      fetch(`/api/option-sets/${id}/options`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) =>
          setExternal((prev) => ({ ...prev, [id]: data.items as Array<{ label: string; value: string }> }))
        )
        .catch(() =>
          setExternal((prev) => ({ ...prev, [id]: [{ label: "(options unavailable)", value: "" }] }))
        );
    }
  }, [config]);

  const setAnswer = useCallback((questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const setRowAnswer = useCallback(
    (parentId: string, rowIndex: number, questionId: string, value: AnswerValue) => {
      setGroups((prev) => {
        const rows = [...(prev[parentId] ?? [])];
        while (rows.length <= rowIndex) rows.push({});
        rows[rowIndex] = { ...rows[rowIndex], [questionId]: value };
        return { ...prev, [parentId]: rows };
      });
    },
    []
  );

  const addRow = useCallback((parentId: string) => {
    setGroups((prev) => ({
      ...prev,
      [parentId]: [...(prev[parentId] ?? []), {}],
    }));
  }, []);

  const removeRow = useCallback((parentId: string, rowIndex: number) => {
    setGroups((prev) => ({
      ...prev,
      [parentId]: (prev[parentId] ?? []).filter((_, i) => i !== rowIndex),
    }));
  }, []);

  // Visibility: evaluate top-level rules; children inherit the parent.
  const visible = useMemo(() => {
    if (!config) return new Set<string>();
    const set = new Set<string>();
    for (const q of config.questions) {
      if (q.parentId) continue;
      if (evaluateVisibility(q.visibilityRule, answers)) {
        set.add(q.id);
        for (const child of config.questions.filter((c) => c.parentId === q.id)) {
          set.add(child.id);
        }
      }
    }
    return set;
  }, [config, answers]);

  const optionsFor = useCallback(
    (optionSetId: string | null | undefined): Array<{ label: string; value: string }> | undefined => {
      if (!optionSetId) return undefined;
      return external[optionSetId];
    },
    [external]
  );

  const liveProgress = useMemo(() => {
    if (!config) return 0;
    const requiredVisible = config.questions.filter(
      (q) => q.required && visible.has(q.id) && !q.isRepeatable && !q.isAggregate
    );
    if (requiredVisible.length === 0) return 100;
    const answered = requiredVisible.filter((q) => !isEmpty(q, answers, groups)).length;
    return Math.round((answered / requiredVisible.length) * 100);
  }, [config, visible, answers, groups]);

  const save = useCallback(
    async (complete: boolean) => {
      if (!config || !responseId) return;
      setSaving(true);
      setError(null);
      try {
        const payload = {
          token: getToken(),
          status: complete ? "COMPLETED" : "DRAFT",
          answers: Object.entries(answers)
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([questionId, value]) => ({ questionId, value })),
          groups: Object.entries(groups)
            .filter(([, rows]) => rows.length > 0)
            .map(([parentQuestionId, rows]) => ({
              parentQuestionId,
              rows: rows.map((row) =>
                Object.entries(row)
                  .filter(([, v]) => v !== null && v !== undefined)
                  .map(([questionId, value]) => ({ questionId, value }))
              ),
            })),
        };
        const res = await fetch(`/api/questionnaires/${slug}/responses/${responseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const message = body?.error?.message ?? "Could not save your response.";
          setError(message);
          toast.error("Could not save", message);
          return;
        }
        setStatus(body?.response?.status ?? "DRAFT");
        if (complete) {
          setSubmitted(true);
          toast.success("Response submitted", "Thank you for completing the questionnaire.");
        } else {
          toast.success("Draft saved", "You can continue later from this device.");
        }
      } catch {
        setError("Network error while saving.");
        toast.error("Network error", "Could not reach the server while saving.");
      } finally {
        setSaving(false);
      }
    },
    [config, responseId, answers, groups, slug, toast]
  );

  if (loading) {
    return <div className="py-20 text-center text-sm text-gray-500">Loading form…</div>;
  }

  if (error && !config) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-700">{error}</p>
        </Card>
      </div>
    );
  }

  if (!config) return null;

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <Card className="p-8 text-center">
          <h1 className="text-xl font-semibold">Thank you!</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your response has been submitted.
            {!config.acceptMultipleResponses && " This form only accepts one response per visitor."}
          </p>
        </Card>
      </div>
    );
  }

  const topLevel = config.questions.filter((q) => !q.parentId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card className="mb-6 p-6">
        <h1 className="text-2xl font-bold">{config.title}</h1>
        {config.description && (
          <p className="mt-2 text-sm text-gray-600">{config.description}</p>
        )}
        <div className="mt-4">
          <ProgressBar value={status === "COMPLETED" ? 100 : liveProgress} />
          <p className="mt-1 text-right text-xs text-gray-500">
            {status === "COMPLETED" ? 100 : liveProgress}% complete
          </p>
        </div>
      </Card>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
        className="space-y-4"
      >
        {topLevel.map((q) => (
          <QuestionBlock
            key={q.id}
            question={q}
            visible={visible.has(q.id)}
            value={answers[q.id] ?? null}
            groupRows={groups[q.id] ?? []}
            optionsFor={optionsFor}
            onAnswer={(v) => setAnswer(q.id, v)}
            onRowAnswer={(row, childId, v) => setRowAnswer(q.id, row, childId, v)}
            onAddRow={() => addRow(q.id)}
            onRemoveRow={(row) => removeRow(q.id, row)}
            childrenOf={
              q.isRepeatable ? config.questions.filter((c) => c.parentId === q.id) : []
            }
            aggregateValue={aggregateDisplay(q, config, answers, groups)}
          />
        ))}

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={() => void save(false)}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------- rendering

function QuestionBlock({
  question,
  visible,
  value,
  groupRows,
  optionsFor,
  onAnswer,
  onRowAnswer,
  onAddRow,
  onRemoveRow,
  childrenOf,
  aggregateValue,
}: {
  question: ConfigQuestion;
  visible: boolean;
  value: AnswerValue;
  groupRows: Array<FlatAnswers>;
  optionsFor: (optionSetId: string | null | undefined) => Array<{ label: string; value: string }> | undefined;
  onAnswer: (v: AnswerValue) => void;
  onRowAnswer: (row: number, childId: string, v: AnswerValue) => void;
  onAddRow: () => void;
  onRemoveRow: (row: number) => void;
  childrenOf: ConfigQuestion[];
  aggregateValue: string;
}) {
  if (!visible) return null;

  const m = question.questionMaster;
  const required = question.required && !question.isRepeatable;

  if (question.isAggregate) {
    return (
      <Card className="p-6">
        <p className="text-sm font-medium text-gray-800">{m.title}</p>
        {m.description && <p className="mt-0.5 text-xs text-gray-500">{m.description}</p>}
        <p className="mt-3 text-2xl font-bold text-indigo-700">
          {aggregateValue === "" ? "—" : aggregateValue}
        </p>
        <p className="mt-1 text-xs text-gray-400">Computed automatically from your answers.</p>
      </Card>
    );
  }

  if (question.isRepeatable) {
    return (
      <Card className="p-6">
        <p className="text-sm font-medium text-gray-800">{m.title}</p>
        {m.description && <p className="mt-0.5 text-xs text-gray-500">{m.description}</p>}
        <div className="mt-4 space-y-4">
          {groupRows.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-xs text-gray-400">
              No rows yet. Add one to begin.
            </p>
          )}
          {groupRows.map((row, rowIndex) => (
            <div key={rowIndex} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">Row {rowIndex + 1}</span>
                <button
                  type="button"
                  onClick={() => onRemoveRow(rowIndex)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="space-y-3">
                {childrenOf.map((child) => (
                  <QuestionInput
                    key={child.id}
                    question={child}
                    value={row[child.id] ?? null}
                    required={child.required}
                    externalOptions={optionsFor(child.options?.optionSetId)}
                    onAnswer={(v) => onRowAnswer(rowIndex, child.id, v)}
                  />
                ))}
              </div>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={onAddRow}>
            + Add row
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <QuestionInput
        question={question}
        value={value}
        required={required}
        externalOptions={optionsFor(question.options?.optionSetId)}
        onAnswer={onAnswer}
      />
    </Card>
  );
}

function QuestionInput({
  question,
  value,
  required,
  externalOptions,
  onAnswer,
}: {
  question: ConfigQuestion;
  value: AnswerValue;
  required?: boolean;
  externalOptions?: Array<{ label: string; value: string }>;
  onAnswer: (v: AnswerValue) => void;
}) {
  const m = question.questionMaster;
  const options = question.options?.items ?? externalOptions ?? [];
  const [infoOpen, setInfoOpen] = useState(false);
  const infoIcon = m.description ? (
    <span
      role="button"
      tabIndex={0}
      aria-label="Question description"
      className="cursor-pointer text-gray-400 hover:text-indigo-600"
      title="Question description"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setInfoOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setInfoOpen((v) => !v);
        }
      }}
    >
      ⓘ
    </span>
  ) : null;
  const description =
    infoOpen && m.description ? (
      <span className="mb-2 block rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
        {m.description}
      </span>
    ) : null;
  const label = (
    <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-800">
      <span>{m.title}</span>
      {required && <span className="text-red-500">*</span>}
      {infoIcon}
    </span>
  );

  switch (m.questionType) {
    case "TEXT":
      return (
        <label className="block">
          {label}
          {description}
          <input
            type="text"
            className={inputClass}
            placeholder={m.placeholder ?? undefined}
            maxLength={m.maxLength ?? undefined}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onAnswer(e.target.value)}
          />
        </label>
      );
    case "TEXTAREA":
      return (
        <label className="block">
          {label}
          {description}
          <textarea
            className={inputClass}
            rows={4}
            placeholder={m.placeholder ?? undefined}
            maxLength={m.maxLength ?? undefined}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onAnswer(e.target.value)}
          />
        </label>
      );
    case "NUMBER":
      return (
        <label className="block">
          {label}
          {description}
          <input
            type="number"
            className={inputClass}
            min={m.minValue ?? undefined}
            max={m.maxValue ?? undefined}
            value={typeof value === "number" ? value : typeof value === "string" ? value : ""}
            onChange={(e) =>
              onAnswer(e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </label>
      );
    case "DATE":
      return (
        <label className="block">
          {label}
          {description}
          <input
            type="date"
            className={inputClass}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onAnswer(e.target.value || null)}
          />
        </label>
      );
    case "RADIO":
      return (
        <fieldset>
          <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-800">
            {m.title}
            {required && <span className="text-red-500">*</span>}
            {infoIcon}
          </legend>
          {description}
          <div className="space-y-2">
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={question.id}
                  checked={value === o.value}
                  onChange={() => onAnswer(o.value)}
                  className="accent-indigo-600"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "CHECKBOX":
      return (
        <fieldset>
          <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-800">
            {m.title}
            {required && <span className="text-red-500">*</span>}
            {infoIcon}
          </legend>
          {description}
          <div className="space-y-2">
            {options.map((o) => {
              const selected = Array.isArray(value) ? value : [];
              return (
                <label key={o.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, o.value]
                        : selected.filter((v) => v !== o.value);
                      onAnswer(next);
                    }}
                    className="accent-indigo-600"
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    case "SELECT":
      return (
        <label className="block">
          {label}
          {description}
          <select
            className={inputClass}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onAnswer(e.target.value || null)}
          >
            <option value="">— Select —</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "RATING":
      return (
        <fieldset>
          <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-800">
            {m.title}
            {required && <span className="text-red-500">*</span>}
            {infoIcon}
          </legend>
          {description}
          <div className="flex gap-1">
            {Array.from({ length: m.ratingMax ?? 5 }, (_, i) => i + 1).map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => onAnswer(star)}
                aria-label={`${star} star${star > 1 ? "s" : ""}`}
                className={`text-2xl transition-colors ${
                  typeof value === "number" && value >= star
                    ? "text-amber-400"
                    : "text-gray-300 hover:text-amber-200"
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </fieldset>
      );
    default:
      return null;
  }
}

// -------------------------------------------------------------- helpers

function isEmpty(
  q: ConfigQuestion,
  answers: FlatAnswers,
  groups: GroupRows
): boolean {
  if (q.parentId) {
    const rows = groups[q.parentId] ?? [];
    return !rows.some((row) => {
      const v = row[q.id];
      return (
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0)
      );
    });
  }
  const v = answers[q.id];
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function aggregateDisplay(
  q: ConfigQuestion,
  config: QuestionnaireConfig,
  answers: FlatAnswers,
  groups: GroupRows
): string {
  if (!q.aggregateConfig) return "";
  const sourceId = q.aggregateConfig.sourceQuestionId;
  const source = config.questions.find((x) => x.id === sourceId);
  const values: Array<number | null> = [];
  if (source?.parentId) {
    for (const row of groups[source.parentId] ?? []) {
      values.push(typeof row[sourceId] === "number" ? (row[sourceId] as number) : null);
    }
  } else {
    values.push(typeof answers[sourceId] === "number" ? (answers[sourceId] as number) : null);
  }
  if (q.aggregateConfig.type === "SUM") {
    const sum = sumValues(values);
    return sum === null ? "" : String(sum);
  }
  return "";
}

function applyPrefill(
  detail: ResponseDto,
  config: QuestionnaireConfig,
  setAnswers: (fn: (prev: FlatAnswers) => FlatAnswers) => void,
  setGroups: (fn: (prev: GroupRows) => GroupRows) => void
): void {
  const flat: FlatAnswers = {};
  const groupRows: GroupRows = {};
  const byId = new Map(config.questions.map((q) => [q.id, q]));

  for (const a of detail.answers ?? []) {
    const q = byId.get(a.questionId);
    if (!q || a.isComputed) continue;
    flat[a.questionId] = extractAnswerValue(q.questionMaster.questionType, a as never);
  }
  for (const g of detail.answerGroups ?? []) {
    const rows = g.answers
      .filter((a) => !a.isComputed)
      .map((a) => {
        const q = byId.get(a.questionId);
        if (!q) return {};
        return { [a.questionId]: extractAnswerValue(q.questionMaster.questionType, a as never) };
      })
      .reduce<FlatAnswers>((acc, row) => ({ ...acc, ...row }), {});
    groupRows[g.parentQuestionId] = [...(groupRows[g.parentQuestionId] ?? []), rows];
  }
  setAnswers(() => flat);
  setGroups(() => groupRows);
}
