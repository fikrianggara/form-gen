"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  updateQuestionnaireSettingsAction,
  setStatusAction,
  addQuestionAction,
  updateQuestionSettingsAction,
  removeQuestionAction,
  reorderQuestionsAction,
} from "@/lib/actions/dashboard";
import type { VisibilityRule } from "@/domain/types";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { SearchableSelect } from "@/components/SearchableSelect";
import type { EditorQuestion } from "@/app/dashboard/questionnaires/[id]/edit/page";

interface EditorProps {
  questionnaire: {
    id: string;
    title: string;
    description: string | null;
    status: "DRAFT" | "ACTIVE" | "CLOSED";
    acceptMultipleResponses: boolean;
    slug: string;
  };
  questions: EditorQuestion[];
  masters: Array<{
    id: string;
    code: string;
    title: string;
    questionType: string;
    requiredDefault: boolean;
  }>;
}

const OPERATORS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "CONTAINS", "ANY_OF", "NONE_OF"];

export function Editor({ questionnaire: q, questions, masters }: EditorProps) {
  const [items, setItems] = useState(questions);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Settings form state
  const [title, setTitle] = useState(q.title);
  const [description, setDescription] = useState(q.description ?? "");
  const [multiple, setMultiple] = useState(q.acceptMultipleResponses);

  // Add-question form state
  const [masterId, setMasterId] = useState("");
  const [required, setRequired] = useState(false);
  const [repeatable, setRepeatable] = useState(false);
  const [isAggregate, setIsAggregate] = useState(false);
  const [aggregateSource, setAggregateSource] = useState("");
  const [parentId, setParentId] = useState("");

  const run = (fn: () => Promise<{ error?: string } | undefined>) => {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
    });
  };

  const numericQuestions = useMemo(
    () =>
      items.flatMap((t) =>
        t.questionMaster.questionType === "NUMBER"
          ? [{ id: t.id, title: t.questionMaster.title }]
          : t.children
              .filter((c) => c.questionMaster.questionType === "NUMBER")
              .map((c) => ({ id: c.id, title: `${t.questionMaster.title} › ${c.questionMaster.title}` }))
      ),
    [items]
  );

  const repeatableParents = useMemo(
    () => items.filter((t) => t.isRepeatable).map((t) => ({ id: t.id, title: t.questionMaster.title })),
    [items]
  );

  const masterOptions = useMemo(
    () =>
      masters.map((m) => ({
        id: m.id,
        label: `${m.code} — ${m.title}`,
        sub: m.questionType,
      })),
    [masters]
  );

  const move = (index: number, dir: -1 | 1) => {
    const next = [...items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    run(() =>
      reorderQuestionsAction({ questionnaireId: q.id, orderedIds: next.map((x) => x.id) })
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{q.title}</h1>
          <p className="text-xs text-gray-500">
            /f/{q.slug} · <Link href={`/dashboard/questionnaires/${q.id}/responses`} className="underline">responses</Link>
          </p>
        </div>
        <Link
          href={`/f/${q.slug}`}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Open form
        </Link>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* Settings */}
      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Settings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Description">
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="accent-indigo-600" />
            Allow multiple responses
          </label>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(() =>
                updateQuestionnaireSettingsAction({
                  id: q.id,
                  title,
                  description: description || null,
                  acceptMultipleResponses: multiple,
                })
              )
            }
          >
            Save settings
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">Status:</span>
            <select
              value={q.status}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              onChange={(e) =>
                run(() =>
                  setStatusAction({ id: q.id, status: e.target.value as "DRAFT" | "ACTIVE" | "CLOSED" })
                )
              }
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Add question */}
      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Add question</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Question master" required hint="Search by code or title">
            <SearchableSelect
              options={masterOptions}
              value={masterId}
              onChange={setMasterId}
              placeholder="Type to search the question bank…"
            />
          </Field>
          <Field label="Repeatable group (optional)">
            <select className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">None</option>
              {repeatableParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-5 text-sm">
          <label className="flex items-center gap-2 text-gray-700">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="accent-indigo-600" />
            Required
          </label>
          <label className="flex items-center gap-2 text-gray-700">
            <input type="checkbox" checked={repeatable} disabled={!!parentId} onChange={(e) => setRepeatable(e.target.checked)} className="accent-indigo-600" />
            Repeatable group
          </label>
          <label className="flex items-center gap-2 text-gray-700">
            <input type="checkbox" checked={isAggregate} onChange={(e) => setIsAggregate(e.target.checked)} className="accent-indigo-600" />
            Aggregate (computed)
          </label>
          {isAggregate && (
            <select
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={aggregateSource}
              onChange={(e) => setAggregateSource(e.target.value)}
            >
              <option value="">— Sum of —</option>
              {numericQuestions.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          )}
          <Button
            disabled={pending || !masterId || (isAggregate && !aggregateSource)}
            onClick={() =>
              run(async () => {
                const res = await addQuestionAction({
                  questionnaireId: q.id,
                  questionMasterId: masterId,
                  required,
                  isRepeatable: repeatable,
                  isAggregate,
                  aggregateConfig: isAggregate ? { type: "SUM", sourceQuestionId: aggregateSource } : null,
                  parentId: parentId || null,
                });
                if (!res?.error) {
                  setMasterId("");
                  setRequired(false);
                  setRepeatable(false);
                  setIsAggregate(false);
                  setAggregateSource("");
                  setParentId("");
                }
                return res;
              })
            }
          >
            Add question
          </Button>
        </div>
      </Card>

      {/* Question list */}
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id}>
            <QuestionRow
              item={item}
              index={index}
              total={items.length}
              allQuestions={items}
              onMove={(dir) => move(index, dir)}
              onToggleRequired={(val) =>
                run(() =>
                  updateQuestionSettingsAction({ questionId: item.id, questionnaireId: q.id, required: val })
                )
              }
              onSaveRule={(rule) =>
                run(() =>
                  updateQuestionSettingsAction({
                    questionId: item.id,
                    questionnaireId: q.id,
                    visibilityRule: rule,
                  })
                )
              }
              onRemove={() =>
                run(async () => {
                  const res = await removeQuestionAction({ questionId: item.id, questionnaireId: q.id });
                  if (!res?.error) setItems((prev) => prev.filter((x) => x.id !== item.id));
                  return res;
                })
              }
            />
            {item.children.length > 0 && (
              <div className="ml-8 mt-2 space-y-2 border-l-2 border-indigo-100 pl-4">
                {item.children.map((child) => (
                  <QuestionRow
                    key={child.id}
                    item={child}
                    index={0}
                    total={1}
                    allQuestions={items}
                    onMove={() => undefined}
                    onToggleRequired={(val) =>
                      run(() =>
                        updateQuestionSettingsAction({ questionId: child.id, questionnaireId: q.id, required: val })
                      )
                    }
                    onSaveRule={(rule) =>
                      run(() =>
                        updateQuestionSettingsAction({
                          questionId: child.id,
                          questionnaireId: q.id,
                          visibilityRule: rule,
                        })
                      )
                    }
                    onRemove={() =>
                      run(async () => {
                        const res = await removeQuestionAction({ questionId: child.id, questionnaireId: q.id });
                        if (!res?.error) {
                          setItems((prev) =>
                            prev.map((x) =>
                              x.id === item.id
                                ? { ...x, children: x.children.filter((c) => c.id !== child.id) }
                                : x
                            )
                          );
                        }
                        return res;
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            No questions yet — add one above.
          </p>
        )}
      </div>
    </div>
  );
}

function QuestionRow({
  item,
  index,
  total,
  allQuestions,
  onMove,
  onToggleRequired,
  onSaveRule,
  onRemove,
}: {
  item: EditorQuestion;
  index: number;
  total: number;
  allQuestions: EditorQuestion[];
  onMove: (dir: -1 | 1) => void;
  onToggleRequired: (val: boolean) => void;
  onSaveRule: (rule: VisibilityRule | null) => void;
  onRemove: () => void;
}) {
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleCondition, setRuleCondition] = useState<"ALL" | "ANY">(
    item.visibilityRule?.condition ?? "ALL"
  );
  const [ruleDependsOn, setRuleDependsOn] = useState(
    item.visibilityRule?.rules[0]?.dependsOnQuestionId ?? ""
  );
  const [ruleOperator, setRuleOperator] = useState(
    item.visibilityRule?.rules[0]?.operator ?? "EQ"
  );
  const [ruleValue, setRuleValue] = useState(
    String(item.visibilityRule?.rules[0]?.value ?? "")
  );

  const candidates = allQuestions.filter(
    (q) => q.id !== item.id && !q.parentId && !q.isAggregate
  );

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 pt-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="Move down"
          >
            ▼
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{item.questionMaster.title}</span>
            <Badge tone="gray">{item.questionMaster.code}</Badge>
            <Badge tone="indigo">{item.questionMaster.questionType}</Badge>
            {item.isRepeatable && <Badge tone="green">repeatable</Badge>}
            {item.isAggregate && <Badge tone="amber">aggregate</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-600">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={item.required}
                onChange={(e) => onToggleRequired(e.target.checked)}
                className="accent-indigo-600"
              />
              Required
            </label>
            <button
              type="button"
              className="underline hover:text-indigo-600"
              onClick={() => setRuleOpen((v) => !v)}
            >
              {item.visibilityRule ? "Edit rule" : "Add rule"}
            </button>
            <button type="button" className="text-red-600 underline hover:text-red-700" onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
      </div>

      {ruleOpen && (
        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <p className="mb-3 text-xs font-medium text-gray-500">Conditional visibility</p>
          <div className="grid gap-3 sm:grid-cols-[100px_1fr_120px_1fr_auto]">
            <select
              className={inputClass}
              value={ruleCondition}
              onChange={(e) => setRuleCondition(e.target.value as "ALL" | "ANY")}
            >
              <option value="ALL">ALL of</option>
              <option value="ANY">ANY of</option>
            </select>
            <select
              className={inputClass}
              value={ruleDependsOn}
              onChange={(e) => setRuleDependsOn(e.target.value)}
            >
              <option value="">— depends on —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.questionMaster.title}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              value={ruleOperator}
              onChange={(e) =>
                setRuleOperator(e.target.value as VisibilityRule["rules"][number]["operator"])
              }
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder="value (e.g. yes / 18)"
              value={ruleValue}
              onChange={(e) => setRuleValue(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!ruleDependsOn}
              onClick={() => {
                const numeric =
                  ruleOperator === "GT" || ruleOperator === "GTE" || ruleOperator === "LT" || ruleOperator === "LTE";
                const parsedValue = numeric && ruleValue !== "" ? Number(ruleValue) : ruleValue;
                onSaveRule(
                  ruleDependsOn
                    ? {
                        condition: ruleCondition,
                        rules: [
                          {
                            dependsOnQuestionId: ruleDependsOn,
                            operator: ruleOperator as VisibilityRule["rules"][number]["operator"],
                            value: parsedValue,
                          },
                        ],
                      }
                    : null
                );
                setRuleOpen(false);
              }}
            >
              Save rule
            </Button>
            {item.visibilityRule && (
              <Button variant="ghost" onClick={() => { onSaveRule(null); setRuleOpen(false); }}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
