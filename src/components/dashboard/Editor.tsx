"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  updateQuestionnaireSettingsAction,
  setStatusAction,
  addQuestionAction,
  updateQuestionSettingsAction,
  updateQuestionMasterVersionAction,
  updateQuestionOptionSetAction,
  removeQuestionAction,
  reorderQuestionsAction,
} from "@/lib/actions/dashboard";
import type { VisibilityRule, VisibilityRuleSet, VisibilityRuleClause } from "@/domain/types";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useToast } from "@/components/toast";
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
    optionSetId: string | null;
    optionSetName: string | null;
  }>;
  masterVersions: Array<{
    id: string;
    code: string;
    version: number;
    title: string;
    isLatest: boolean;
    questionType: string;
  }>;
  optionSets: Array<{
    id: string;
    name: string;
    version: number;
    isLatest: boolean;
    source: string;
  }>;
  generatedBanner?: { matchCount: number; lowCount: number } | null;
}

const OPERATORS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "CONTAINS", "ANY_OF", "NONE_OF"];

const CHOICE_TYPES = ["RADIO", "CHECKBOX", "SELECT"];

export function Editor({
  questionnaire: q,
  questions,
  masters,
  masterVersions,
  optionSets,
  generatedBanner,
}: EditorProps) {
  const toast = useToast();
  const [items, setItems] = useState(questions);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Settings form state
  const [title, setTitle] = useState(q.title);
  const [description, setDescription] = useState(q.description ?? "");
  const [multiple, setMultiple] = useState(q.acceptMultipleResponses);

  // Add-question form state
  const [masterId, setMasterId] = useState("");
  const [masterVersionId, setMasterVersionId] = useState("");
  const [optionSetVersionId, setOptionSetVersionId] = useState("");
  const [required, setRequired] = useState(false);
  const [repeatable, setRepeatable] = useState(false);
  const [isAggregate, setIsAggregate] = useState(false);
  const [aggregateSource, setAggregateSource] = useState("");
  const [parentId, setParentId] = useState("");

  const run = (fn: () => Promise<{ error?: string } | undefined>, success?: string) => {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) {
        setError(res.error);
        toast.error("Action failed", res.error);
      } else if (success) {
        toast.success(success);
      }
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

  const selectedMaster = masters.find((m) => m.id === masterId) ?? null;

  const selectedMasterVersions = useMemo(
    () =>
      selectedMaster
        ? masterVersions
            .filter((v) => v.code === selectedMaster.code)
            .sort((a, b) => a.version - b.version)
        : [],
    [selectedMaster, masterVersions]
  );

  const selectedMasterOptionSets = useMemo(
    () =>
      selectedMaster?.optionSetName
        ? optionSets
            .filter((o) => o.name === selectedMaster.optionSetName)
            .sort((a, b) => a.version - b.version)
        : [],
    [selectedMaster, optionSets]
  );

  const pickMaster = (id: string) => {
    setMasterId(id);
    const master = masters.find((m) => m.id === id);
    if (!master) return;
    const versions = masterVersions
      .filter((v) => v.code === master.code)
      .sort((a, b) => a.version - b.version);
    const latest = versions[versions.length - 1];
    setMasterVersionId(latest?.id ?? id);
    setOptionSetVersionId("");
  };

  /**
   * Move `dragId` to the position of `targetId` within a scope's id list,
   * then apply locally and persist.
   */
  const applyDrop = (
    scopeIds: string[],
    drag: string,
    target: string,
    persist: (ordered: string[]) => void,
    applyLocally?: (ordered: string[]) => void
  ) => {
    const from = scopeIds.indexOf(drag);
    const to = scopeIds.indexOf(target);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...scopeIds];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    if (applyLocally) applyLocally(next);
    persist(next);
  };

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

  const moveChild = (parentId: string, ordered: string[]) => {
    run(() =>
      reorderQuestionsAction({
        questionnaireId: q.id,
        orderedIds: ordered,
        parentId,
      })
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

      {generatedBanner && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm text-indigo-900">
          <p className="font-medium">Questionnaire generated from your prompt.</p>
          <p className="mt-0.5 text-indigo-700">
            {generatedBanner.matchCount} question{generatedBanner.matchCount === 1 ? "" : "s"} suggested
            {generatedBanner.lowCount > 0 && (
              <>
                {" "}· <span className="font-medium text-amber-700">{generatedBanner.lowCount} flagged as low confidence</span>
                {" "}— review them before publishing
              </>
            )}
            .
          </p>
        </div>
      )}

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
              run(
                () =>
                  updateQuestionnaireSettingsAction({
                    id: q.id,
                    title,
                    description: description || null,
                    acceptMultipleResponses: multiple,
                  }),
                "Settings saved"
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
              onChange={(e) => {
                const status = e.target.value as "DRAFT" | "ACTIVE" | "CLOSED";
                run(
                  () => setStatusAction({ id: q.id, status }),
                  `Status set to ${status}`
                );
              }}
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
              onChange={pickMaster}
              placeholder="Type to search the question bank…"
            />
          </Field>
          <Field label="Master version" hint="Which version of the master to pin">
            <select
              className={inputClass}
              value={masterVersionId}
              onChange={(e) => setMasterVersionId(e.target.value)}
              disabled={!selectedMaster}
            >
              {selectedMasterVersions.length === 0 && <option value="">— select master first —</option>}
              {selectedMasterVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version}{v.isLatest ? " (latest)" : ""} — {v.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {selectedMaster && CHOICE_TYPES.includes(selectedMaster.questionType) && selectedMaster.optionSetName && (
          <div className="mt-4">
            <Field label="Option set version" hint={`Override for "${selectedMaster.optionSetName}"; default = the version pinned on the master`}>
              <select
                className={inputClass}
                value={optionSetVersionId}
                onChange={(e) => setOptionSetVersionId(e.target.value)}
              >
                <option value="">Default (version pinned on the master)</option>
                {selectedMasterOptionSets.map((o) => (
                  <option key={o.id} value={o.id}>
                    v{o.version}{o.isLatest ? " (latest)" : ""} · {o.source === "EXTERNAL_API" ? "external API" : "static"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                  questionMasterId: masterVersionId || masterId,
                  required,
                  isRepeatable: repeatable,
                  isAggregate,
                  aggregateConfig: isAggregate ? { type: "SUM", sourceQuestionId: aggregateSource } : null,
                  parentId: parentId || null,
                  optionSetId: optionSetVersionId || null,
                });
                if (!res?.error) {
                  setMasterId("");
                  setMasterVersionId("");
                  setOptionSetVersionId("");
                  setRequired(false);
                  setRepeatable(false);
                  setIsAggregate(false);
                  setAggregateSource("");
                  setParentId("");
                }
                return res;
              }, "Question added")
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
              masterVersions={masterVersions}
              optionSets={optionSets}
              dragging={dragId === item.id}
              dragOver={dragOverId === item.id}
              dragHandlers={{
                onDragStart: (e) => {
                  setDragId(item.id);
                  e.dataTransfer.effectAllowed = "move";
                },
                onDragOver: (e) => {
                  e.preventDefault();
                  setDragOverId(item.id);
                },
                onDragLeave: () => setDragOverId((cur) => (cur === item.id ? null : cur)),
                onDrop: (e) => {
                  e.preventDefault();
                  if (dragId && dragOverId) {
                    applyDrop(
                      items.map((x) => x.id),
                      dragId,
                      dragOverId,
                      (next) =>
                        run(() =>
                          reorderQuestionsAction({ questionnaireId: q.id, orderedIds: next })
                        ),
                      (next) =>
                        setItems(next.map((id) => items.find((x) => x.id === id)!).filter(Boolean))
                    );
                  }
                  setDragId(null);
                  setDragOverId(null);
                },
                onDragEnd: () => {
                  setDragId(null);
                  setDragOverId(null);
                },
              }}
              onMove={(dir) => move(index, dir)}
              onToggleRequired={(val) =>
                run(() =>
                  updateQuestionSettingsAction({ questionId: item.id, questionnaireId: q.id, required: val })
                )
              }
              onMasterVersionChange={(questionId, masterVersionId) =>
                run(
                  () =>
                    updateQuestionMasterVersionAction({
                      questionnaireId: q.id,
                      questionId,
                      masterVersionId,
                    }),
                  "Master version updated"
                )
              }
              onOptionSetChange={(questionId, optionSetId) =>
                run(
                  () =>
                    updateQuestionOptionSetAction({
                      questionnaireId: q.id,
                      questionId,
                      optionSetId,
                    }),
                  "Option set version updated"
                )
              }
              onSaveRule={(rule) =>
                run(
                  () =>
                    updateQuestionSettingsAction({
                      questionId: item.id,
                      questionnaireId: q.id,
                      visibilityRule: rule,
                    }),
                  "Visibility rule saved"
                )
              }
              onRemove={() =>
                run(async () => {
                  const res = await removeQuestionAction({ questionId: item.id, questionnaireId: q.id });
                  if (!res?.error) setItems((prev) => prev.filter((x) => x.id !== item.id));
                  return res;
                }, "Question removed")
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
                    masterVersions={masterVersions}
                    optionSets={optionSets}
                    dragging={dragId === child.id}
                    dragOver={dragOverId === child.id}
                    dragHandlers={{
                      onDragStart: (e) => {
                        setDragId(child.id);
                        e.dataTransfer.effectAllowed = "move";
                      },
                      onDragOver: (e) => {
                        e.preventDefault();
                        setDragOverId(child.id);
                      },
                      onDragLeave: () => setDragOverId((cur) => (cur === child.id ? null : cur)),
                      onDrop: (e) => {
                        e.preventDefault();
                        const childIds = item.children.map((c) => c.id);
                        if (dragId && dragOverId) {
                          applyDrop(
                            childIds,
                            dragId,
                            dragOverId,
                            (next) => moveChild(item.id, next),
                            (next) =>
                              setItems((prev) =>
                                prev.map((x) =>
                                  x.id === item.id
                                    ? {
                                        ...x,
                                        children: next
                                          .map((id) => x.children.find((c) => c.id === id)!)
                                          .filter(Boolean),
                                      }
                                    : x
                                )
                              )
                          );
                        }
                        setDragId(null);
                        setDragOverId(null);
                      },
                      onDragEnd: () => {
                        setDragId(null);
                        setDragOverId(null);
                      },
                    }}
                    onMove={() => undefined}
                    onToggleRequired={(val) =>
                      run(() =>
                        updateQuestionSettingsAction({ questionId: child.id, questionnaireId: q.id, required: val })
                      )
                    }
                    onMasterVersionChange={(questionId, masterVersionId) =>
                      run(
                        () =>
                          updateQuestionMasterVersionAction({
                            questionnaireId: q.id,
                            questionId,
                            masterVersionId,
                          }),
                        "Master version updated"
                      )
                    }
                    onOptionSetChange={(questionId, optionSetId) =>
                      run(
                        () =>
                          updateQuestionOptionSetAction({
                            questionnaireId: q.id,
                            questionId,
                            optionSetId,
                          }),
                        "Option set version updated"
                      )
                    }
                    onSaveRule={(rule) =>
                      run(
                        () =>
                          updateQuestionSettingsAction({
                            questionId: child.id,
                            questionnaireId: q.id,
                            visibilityRule: rule,
                          }),
                        "Visibility rule saved"
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
                      }, "Question removed")
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
  onMasterVersionChange,
  onOptionSetChange,
  masterVersions,
  optionSets,
  dragging,
  dragOver,
  dragHandlers,
}: {
  item: EditorQuestion;
  index: number;
  total: number;
  allQuestions: EditorQuestion[];
  onMove: (dir: -1 | 1) => void;
  onToggleRequired: (val: boolean) => void;
  onSaveRule: (rule: VisibilityRule | null) => void;
  onRemove: () => void;
  onMasterVersionChange: (questionId: string, masterVersionId: string) => void;
  onOptionSetChange: (questionId: string, optionSetId: string | null) => void;
  masterVersions: Array<{ id: string; code: string; version: number; isLatest: boolean; title: string }>;
  optionSets: Array<{ id: string; name: string; version: number; isLatest: boolean; source: string }>;
  dragging: boolean;
  dragOver: boolean;
  dragHandlers: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
}) {
  const [ruleOpen, setRuleOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // Multi-set editor state: OR between sets, ALL/ANY within each set.
  const [ruleSets, setRuleSets] = useState<VisibilityRuleSet[]>(() => {
    const r = item.visibilityRule;
    if (r && Array.isArray(r.sets)) return r.sets;
    if (r && Array.isArray(r.rules)) return [{ condition: r.condition ?? "ALL", rules: r.rules }];
    return [];
  });

  const candidates = allQuestions.filter(
    (q) => q.id !== item.id && !q.parentId && !q.isAggregate
  );

  const versions = masterVersions
    .filter((v) => v.code === item.questionMaster.code)
    .sort((a, b) => a.version - b.version);

  const setVersions = item.masterOptionSetName
    ? optionSets
        .filter((o) => o.name === item.masterOptionSetName)
        .sort((a, b) => a.version - b.version)
    : [];

  return (
    <Card
      className={`p-4 transition-shadow ${dragging ? "opacity-60" : ""} ${dragOver ? "ring-2 ring-indigo-300" : ""}`}
      {...dragHandlers}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 pt-1">
          <span
            className="cursor-grab text-gray-300 hover:text-gray-500"
            title="Drag to reorder"
            draggable
            onDragStart={dragHandlers.onDragStart}
          >
            ⠿
          </span>
          <div className="flex flex-col gap-1">
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
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{item.questionMaster.title}</span>
            {item.questionMaster.description && (
              <button
                type="button"
                className="text-gray-400 hover:text-indigo-600"
                onClick={() => setInfoOpen((v) => !v)}
                aria-label="Question description"
                title="Question description"
              >
                ⓘ
              </button>
            )}
            <Badge tone="gray">{item.questionMaster.code}</Badge>
            <Badge tone="indigo">{item.questionMaster.questionType}</Badge>
            {item.isRepeatable && <Badge tone="green">repeatable</Badge>}
            {item.isAggregate && <Badge tone="amber">aggregate</Badge>}
            {item.aiSuggested && (
              <>
                <Badge tone="indigo">AI {item.aiConfidence !== null ? item.aiConfidence.toFixed(2) : ""}</Badge>
                {item.aiLowConfidence && (
                  <span
                    className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                    title="The system was not confident this question matches the generation prompt — review before publishing."
                  >
                    ⚠ low confidence
                  </span>
                )}
              </>
            )}
          </div>

          {infoOpen && item.questionMaster.description && (
            <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
              {item.questionMaster.description}
            </p>
          )}

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
            {versions.length > 1 && (
              <label className="flex items-center gap-1.5">
                <span className="text-gray-400">v:</span>
                <select
                  className="rounded-lg border border-gray-300 px-1.5 py-1 text-xs"
                  value={item.questionMaster.id}
                  onChange={(e) => onMasterVersionChange(item.id, e.target.value)}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version}{v.isLatest ? " (latest)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {setVersions.length > 1 && (
              <label className="flex items-center gap-1.5">
                <span className="text-gray-400">options:</span>
                <select
                  className="rounded-lg border border-gray-300 px-1.5 py-1 text-xs"
                  value={item.optionSetId ?? ""}
                  onChange={(e) => onOptionSetChange(item.id, e.target.value || null)}
                >
                  <option value="">default</option>
                  {setVersions.map((o) => (
                    <option key={o.id} value={o.id}>
                      v{o.version}{o.isLatest ? " (latest)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
          <p className="mb-3 text-xs font-medium text-gray-500">
            Conditional visibility — rule sets combine with <b>OR</b> (show when ANY set matches); conditions
            inside a set combine per <b>ALL/ANY</b>.
          </p>
          <div className="space-y-3">
            {ruleSets.map((set, setIdx) => (
              <div key={setIdx} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs text-gray-400">Set {setIdx + 1}</span>
                  <select
                    className={inputClass}
                    value={set.condition}
                    onChange={(e) => {
                      const next = [...ruleSets];
                      next[setIdx] = { ...next[setIdx], condition: e.target.value as "ALL" | "ANY" };
                      setRuleSets(next);
                    }}
                  >
                    <option value="ALL">ALL of</option>
                    <option value="ANY">ANY of</option>
                  </select>
                  <button
                    type="button"
                    className="ml-auto text-xs text-red-600 hover:underline"
                    onClick={() => setRuleSets((prev) => prev.filter((_, i) => i !== setIdx))}
                  >
                    Remove set
                  </button>
                </div>
                <div className="space-y-2">
                  {set.rules.map((clause, clauseIdx) => (
                    <div key={clauseIdx} className="grid gap-2 sm:grid-cols-[1fr_120px_1fr_auto]">
                      <select
                        className={inputClass}
                        value={clause.dependsOnQuestionId}
                        onChange={(e) => {
                          const next = [...ruleSets];
                          next[setIdx] = {
                            ...next[setIdx],
                            rules: next[setIdx].rules.map((c, i) =>
                              i === clauseIdx ? { ...c, dependsOnQuestionId: e.target.value } : c
                            ),
                          };
                          setRuleSets(next);
                        }}
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
                        value={clause.operator}
                        onChange={(e) => {
                          const next = [...ruleSets];
                          next[setIdx] = {
                            ...next[setIdx],
                            rules: next[setIdx].rules.map((c, i) =>
                              i === clauseIdx
                                ? { ...c, operator: e.target.value as VisibilityRuleClause["operator"] }
                                : c
                            ),
                          };
                          setRuleSets(next);
                        }}
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
                        value={Array.isArray(clause.value) ? clause.value.join(",") : String(clause.value ?? "")}
                        onChange={(e) => {
                          const next = [...ruleSets];
                          next[setIdx] = {
                            ...next[setIdx],
                            rules: next[setIdx].rules.map((c, i) =>
                              i === clauseIdx ? { ...c, value: e.target.value } : c
                            ),
                          };
                          setRuleSets(next);
                        }}
                      />
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => {
                          const next = [...ruleSets];
                          next[setIdx] = {
                            ...next[setIdx],
                            rules: next[setIdx].rules.filter((_, i) => i !== clauseIdx),
                          };
                          setRuleSets(next);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-xs text-indigo-600 hover:underline"
                    onClick={() =>
                      setRuleSets((prev) =>
                        prev.map((s, i) =>
                          i === setIdx
                            ? { ...s, rules: [...s.rules, { dependsOnQuestionId: "", operator: "EQ", value: "" }] }
                            : s
                        )
                      )
                    }
                  >
                    + Add clause
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                setRuleSets((prev) => [...prev, { condition: "ALL", rules: [] }])
              }
            >
              + Add rule set (OR)
            </Button>
            <Button
              disabled={ruleSets.length === 0}
              onClick={() => {
                const parsed = ruleSets.map((set) => ({
                  condition: set.condition,
                  rules: set.rules
                    .filter((c) => c.dependsOnQuestionId && c.operator)
                    .map((c) => {
                      const numeric =
                        c.operator === "GT" || c.operator === "GTE" || c.operator === "LT" || c.operator === "LTE";
                      const raw = String(c.value ?? "").trim();
                      return {
                        dependsOnQuestionId: c.dependsOnQuestionId,
                        operator: c.operator,
                        value: numeric && raw !== "" ? Number(raw) : raw,
                      };
                    }),
                }));
                onSaveRule(parsed.some((s) => s.rules.length > 0) ? { sets: parsed } : null);
                setRuleOpen(false);
              }}
            >
              Save rules
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
