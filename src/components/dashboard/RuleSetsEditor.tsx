"use client";

import type { VisibilityRuleClause, VisibilityRuleSet } from "@/domain/types";
import { Button, inputClass } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";

export const OPERATORS: VisibilityRuleClause["operator"][] = [
  "EQ",
  "NEQ",
  "GT",
  "GTE",
  "LT",
  "LTE",
  "CONTAINS",
  "ANY_OF",
  "NONE_OF",
];

interface Candidate {
  id: string;
  label: string;
}

/**
 * Multi-set rule editor: OR between sets, ALL/ANY within each set.
 * Controlled component — parent owns the `sets` state.
 */
export function RuleSetsEditor({
  sets,
  onChange,
  candidates,
}: {
  sets: VisibilityRuleSet[];
  onChange: (sets: VisibilityRuleSet[]) => void;
  candidates: Candidate[];
}) {
  const updateSet = (setIdx: number, patch: Partial<VisibilityRuleSet>) =>
    onChange(sets.map((s, i) => (i === setIdx ? { ...s, ...patch } : s)));
  const updateClause = (setIdx: number, clauseIdx: number, patch: Partial<VisibilityRuleClause>) =>
    updateSet(setIdx, {
      rules: sets[setIdx].rules.map((c, i) => (i === clauseIdx ? { ...c, ...patch } : c)),
    });

  return (
    <div className="space-y-3">
      {sets.map((set, setIdx) => (
        <div key={setIdx} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-gray-400">Set {setIdx + 1}</span>
            <select
              className={inputClass}
              value={set.condition}
              onChange={(e) => updateSet(setIdx, { condition: e.target.value as "ALL" | "ANY" })}
            >
              <option value="ALL">ALL of</option>
              <option value="ANY">ANY of</option>
            </select>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
              onClick={() => onChange(sets.filter((_, i) => i !== setIdx))}
            >
              <IconTrash size={13} />
              Remove set
            </button>
          </div>
          <div className="space-y-2">
            {set.rules.map((clause, clauseIdx) => (
              <div key={clauseIdx} className="grid gap-2 sm:grid-cols-[1fr_120px_1fr_auto]">
                <select
                  className={inputClass}
                  value={clause.dependsOnQuestionId}
                  onChange={(e) => updateClause(setIdx, clauseIdx, { dependsOnQuestionId: e.target.value })}
                >
                  <option value="">— depends on —</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select
                  className={inputClass}
                  value={clause.operator}
                  onChange={(e) =>
                    updateClause(setIdx, clauseIdx, {
                      operator: e.target.value as VisibilityRuleClause["operator"],
                    })
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
                  value={Array.isArray(clause.value) ? clause.value.join(",") : String(clause.value ?? "")}
                  onChange={(e) => updateClause(setIdx, clauseIdx, { value: e.target.value })}
                />
                <button
                  type="button"
                  className="inline-flex items-center text-xs text-red-600 hover:underline"
                  onClick={() =>
                    updateSet(setIdx, { rules: set.rules.filter((_, i) => i !== clauseIdx) })
                  }
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
              onClick={() =>
                updateSet(setIdx, {
                  rules: [...set.rules, { dependsOnQuestionId: "", operator: "EQ", value: "" }],
                })
              }
            >
              <IconPlus size={13} />
              Add clause
            </button>
          </div>
        </div>
      ))}
      <Button variant="secondary" onClick={() => onChange([...sets, { condition: "ALL", rules: [] }])}>
        <IconPlus size={15} className="mr-2" />
        Add rule set (OR)
      </Button>
    </div>
  );
}
