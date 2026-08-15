"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";
import { updateResponseAction } from "@/lib/actions/responses";
import { extractAnswerValue } from "@/domain/answers";
import type { QuestionType } from "@prisma/client";
import { IconPlus } from "@/components/icons";

type Config = NonNullable<Awaited<ReturnType<typeof import("@/services/response.service").getQuestionnaireConfig>>>;
type Detail = NonNullable<Awaited<ReturnType<typeof import("@/services/response.service").getResponseDetail>>>;

type AnswerValue = string | number | string[] | null;

interface GroupRowCell {
  questionId: string;
  value: AnswerValue;
}
interface GroupValue {
  parentQuestionId: string;
  rows: GroupRowCell[][];
}

function usePrefilled(config: Config, detail: Detail) {
  const flat = useMemo(() => {
    const map = new Map<string, AnswerValue>();
    for (const a of detail.answers) {
      if (!a.answerGroupId) {
        map.set(a.questionId, extractAnswerValue(a.question.questionMaster.questionType, a as never));
      }
    }
    return map;
  }, [detail]);

  const groups = useMemo(() => {
    // detail.answerGroups: one entry per repeatable row.
    return detail.answerGroups.map((g) => ({
      parentQuestionId: g.parentQuestionId,
      rows: [
        g.answers.map((a) => ({
          questionId: a.questionId,
          value: extractAnswerValue(a.question.questionMaster.questionType, a as never),
        })),
      ],
    }));
  }, [detail]);

  return { flat, groups };
}

export function ResponseEditForm({
  questionnaireId,
  responseId,
  config,
  detail,
}: {
  questionnaireId: string;
  responseId: string;
  config: Config;
  detail: Detail;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, AnswerValue>>(() => {
    const init: Record<string, AnswerValue> = {};
    for (const a of detail.answers) {
      if (!a.answerGroupId) {
        init[a.questionId] = extractAnswerValue(a.question.questionMaster.questionType, a as never);
      }
    }
    return init;
  });
  const { groups } = usePrefilled(config, detail);
  const [groupValues, setGroupValues] = useState<GroupValue[]>(groups);

  const setValue = (questionId: string, value: AnswerValue) =>
    setValues((prev) => ({ ...prev, [questionId]: value }));

  const setGroupRowValue = (parentQuestionId: string, rowIndex: number, questionId: string, value: AnswerValue) =>
    setGroupValues((prev) =>
      prev.map((g) =>
        g.parentQuestionId === parentQuestionId
          ? {
              ...g,
              rows: g.rows.map((row, i) =>
                i === rowIndex ? row.map((a) => (a.questionId === questionId ? { ...a, value } : a)) : row
              ),
            }
          : g
      )
    );

  const addGroupRow = (parentQuestionId: string, questions: Config["questions"]) => {
    const childIds = questions.filter((q) => q.parentId === parentQuestionId).map((q) => q.id);
    setGroupValues((prev) =>
      prev.map((g) =>
        g.parentQuestionId === parentQuestionId
          ? { ...g, rows: [...g.rows, childIds.map((id) => ({ questionId: id, value: null }))] }
          : g
      )
    );
  };

  const save = (complete: boolean) => {
    startTransition(async () => {
      const answers = Object.entries(values)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([questionId, value]) => ({ questionId, value: value as string | number | string[] | null }));
      const groupsPayload = groupValues
        .filter((g) => g.rows.length > 0)
        .map((g) => ({ parentQuestionId: g.parentQuestionId, rows: g.rows }));

      const res = await updateResponseAction({
        questionnaireId,
        responseId,
        data: {
          status: complete ? "COMPLETED" : "DRAFT",
          answers,
          groups: groupsPayload as never,
          respondentLabel: detail.respondentLabel,
        },
      });
      if (res.error) {
        toast.error("Save failed", res.error);
      } else {
        toast.success(complete ? "Response completed" : "Draft saved", "Changes persisted.");
        router.push(`/dashboard/questionnaires/${questionnaireId}/responses/${responseId}`);
      }
    });
  };

  const visibleQuestions = config.questions.filter((q) => !q.parentId && !q.isAggregate);
  const repeatableParents = visibleQuestions.filter((q) => q.isRepeatable);

  return (
    <div className="space-y-4">
      {visibleQuestions.map((q) => (
        <EditQuestionField
          key={q.id}
          question={q}
          value={values[q.id] ?? null}
          onChange={(v) => setValue(q.id, v)}
        />
      ))}

      {repeatableParents.map((parent) => {
        const group = groupValues.find((g) => g.parentQuestionId === parent.id);
        const children = config.questions.filter((c) => c.parentId === parent.id);
        return (
          <Card key={parent.id} className="p-5">
            <h3 className="mb-1 font-semibold text-gray-800">{parent.questionMaster.title}</h3>
            <p className="mb-3 text-xs text-gray-500">Repeatable group</p>
            {(group?.rows ?? []).map((row, rowIndex) => (
              <div key={rowIndex} className="mb-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                {children.map((c) => {
                  const cell = row.find((a) => a.questionId === c.id);
                  return (
                    <EditQuestionField
                      key={c.id}
                      question={c}
                      value={cell?.value ?? null}
                      onChange={(v) => setGroupRowValue(parent.id, rowIndex, c.id, v)}
                      compact
                    />
                  );
                })}
              </div>
            ))}
            <Button variant="secondary" disabled={pending} onClick={() => addGroupRow(parent.id, config.questions)}>
              <IconPlus size={15} className="mr-2" />
              Add row
            </Button>
          </Card>
        );
      })}

      <div className="flex items-center gap-3">
        <Button disabled={pending} onClick={() => save(false)}>
          Save draft
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => save(true)}>
          Save & complete
        </Button>
        <span className="text-xs text-gray-500">Required-field validation runs on save.</span>
      </div>
    </div>
  );
}

function EditQuestionField({
  question,
  value,
  onChange,
  compact,
}: {
  question: Config["questions"][number];
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  compact?: boolean;
}) {
  const type = question.questionMaster.questionType;
  const title = compact ? `${question.questionMaster.code}` : question.questionMaster.title;
  return (
    <Field label={title} required={question.required}>
      <InputForType type={type} question={question} value={value} onChange={onChange} />
    </Field>
  );
}

function InputForType({
  type,
  question,
  value,
  onChange,
}: {
  type: QuestionType;
  question: Config["questions"][number];
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
}) {
  switch (type) {
    case "NUMBER":
    case "RATING":
      return (
        <input
          className={inputClass}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "DATE":
      return (
        <input
          className={inputClass}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "TEXTAREA":
      return (
        <textarea
          className={inputClass}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "RADIO":
    case "SELECT":
      return (
        <select
          className={inputClass}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">—</option>
          {(question.options?.items ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "CHECKBOX":
      return (
        <div className="flex flex-wrap gap-3">
          {(question.options?.items ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Array.isArray(value) && value.includes(o.value)}
                onChange={(e) => {
                  const cur = Array.isArray(value) ? value : [];
                  onChange(e.target.checked ? [...cur, o.value] : cur.filter((v) => v !== o.value));
                }}
                className="accent-indigo-600"
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    case "TEXT":
    default:
      return (
        <input
          className={inputClass}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
  }
}
