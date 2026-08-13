"use client";

import { useMemo, useState, useTransition } from "react";
import { saveQuestionMasterAction, deleteQuestionMasterAction } from "@/lib/actions/dashboard";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";

const QUESTION_TYPES = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "RADIO", "CHECKBOX", "SELECT", "RATING"];

export interface MasterRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  questionType: string;
  requiredDefault: boolean;
  optionSetId: string | null;
  version: number;
}

export interface MasterVersionRow {
  id: string;
  code: string;
  title: string;
  version: number;
  isLatest: boolean;
  updatedAt: string;
}

export interface OptionSetOption {
  id: string;
  name: string;
}

export function MastersPanel({
  masters,
  history,
  optionSets,
}: {
  masters: MasterRow[];
  history: MasterVersionRow[];
  optionSets: OptionSetOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [query, setQuery] = useState("");
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return masters;
    return masters.filter(
      (m) =>
        m.code.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.questionType.toLowerCase().includes(q)
    );
  }, [masters, query]);

  const historyByCode = useMemo(() => {
    const map = new Map<string, MasterVersionRow[]>();
    for (const h of history) {
      const list = map.get(h.code) ?? [];
      list.push(h);
      map.set(h.code, list);
    }
    return map;
  }, [history]);

  const run = (fn: () => Promise<{ error?: string } | undefined>) => {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
      else setEditing(null);
    });
  };

  const form = editing;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">{form ? `Edit ${form.code} (v${form.version})` : "New question master"}</h2>
        {form && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Saving creates a new immutable version (v{form.version + 1}). Questionnaires already
            using this master keep the version they were built with.
          </p>
        )}
        <form
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const type = String(fd.get("questionType") ?? "") as "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "RADIO" | "CHECKBOX" | "SELECT" | "RATING";
            const optionSetId = String(fd.get("optionSetId") ?? "") || null;
            run(() =>
              saveQuestionMasterAction({
                id: form?.id,
                code: String(fd.get("code") ?? ""),
                title: String(fd.get("title") ?? ""),
                description: String(fd.get("description") ?? "") || undefined,
                questionType: type,
                requiredDefault: fd.get("requiredDefault") === "on",
                placeholder: String(fd.get("placeholder") ?? "") || undefined,
                minValue: fd.get("minValue") ? Number(fd.get("minValue")) : null,
                maxValue: fd.get("maxValue") ? Number(fd.get("maxValue")) : null,
                maxLength: fd.get("maxLength") ? Number(fd.get("maxLength")) : null,
                ratingMax: fd.get("ratingMax") ? Number(fd.get("ratingMax")) : null,
                optionSetId,
              })
            );
          }}
        >
          <Field label="Code" required hint="Cannot be changed after creation">
            <input name="code" required disabled={!!form} defaultValue={form?.code} className={inputClass} placeholder="q_name" />
          </Field>
          <Field label="Title" required>
            <input name="title" required defaultValue={form?.title} className={inputClass} />
          </Field>
          <Field label="Type" required>
            <select name="questionType" required defaultValue={form?.questionType ?? "TEXT"} className={inputClass}>
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Description" hint="Shown under the question title">
            <input name="description" defaultValue={form?.description ?? ""} className={inputClass} />
          </Field>
          <Field label="Placeholder">
            <input name="placeholder" defaultValue={form?.description ?? ""} className={inputClass} />
          </Field>
          <Field label="Option set" hint="Required for RADIO / CHECKBOX / SELECT">
            <select name="optionSetId" defaultValue={form?.optionSetId ?? ""} className={inputClass}>
              <option value="">— None —</option>
              {optionSets.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Min (number types)">
            <input name="minValue" type="number" className={inputClass} />
          </Field>
          <Field label="Max (number types)">
            <input name="maxValue" type="number" className={inputClass} />
          </Field>
          <Field label="Max length (text types)">
            <input name="maxLength" type="number" className={inputClass} />
          </Field>
          <Field label="Rating max">
            <input name="ratingMax" type="number" className={inputClass} defaultValue={5} />
          </Field>
          <label className="flex items-center gap-2 pt-6 text-sm text-gray-700">
            <input name="requiredDefault" type="checkbox" defaultChecked={form?.requiredDefault} className="accent-indigo-600" />
            Required by default
          </label>
          <div className="flex items-end gap-2 sm:col-span-3">
            <Button type="submit" disabled={pending}>
              {form ? `Save as v${form.version + 1}` : "Create master"}
            </Button>
            {form && (
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <div>
        <input
          className={`${inputClass} mb-4 max-w-sm`}
          placeholder="Search by code, title or type…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Required</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((m) => (
                <MasterRowView
                  key={m.id}
                  master={m}
                  history={historyByCode.get(m.code) ?? []}
                  historyOpen={openHistory === m.code}
                  onToggleHistory={() =>
                    setOpenHistory((cur) => (cur === m.code ? null : m.code))
                  }
                  onEdit={() => setEditing(m)}
                  onDelete={() => {
                    if (confirm(`Delete master ${m.code} (all versions)?`)) {
                      run(() => deleteQuestionMasterAction({ id: m.id }));
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="p-8 text-center text-sm text-gray-400">
              No masters match “{query}”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MasterRowView({
  master,
  history,
  historyOpen,
  onToggleHistory,
  onEdit,
  onDelete,
}: {
  master: MasterRow;
  history: MasterVersionRow[];
  historyOpen: boolean;
  onToggleHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3 font-mono text-xs text-gray-600">{master.code}</td>
        <td className="px-4 py-3 text-gray-900">{master.title}</td>
        <td className="px-4 py-3"><Badge tone="indigo">{master.questionType}</Badge></td>
        <td className="px-4 py-3">{master.requiredDefault ? "yes" : "no"}</td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={onToggleHistory}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
            title="View version history"
          >
            v{master.version} {history.length > 1 ? `(${history.length})` : ""} ▾
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-3 text-xs">
            <button className="text-indigo-600 hover:underline" onClick={onEdit}>
              Edit (v{master.version + 1})
            </button>
            <button className="text-red-600 hover:underline" onClick={onDelete}>
              Delete
            </button>
          </div>
        </td>
      </tr>
      {historyOpen && (
        <tr className="bg-gray-50/50">
          <td colSpan={6} className="px-6 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Version history
            </p>
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 text-xs text-gray-600">
                  <span className="font-mono">v{h.version}</span>
                  <span className="flex-1 truncate">{h.title}</span>
                  {h.isLatest && <Badge tone="green">latest</Badge>}
                  <span className="text-gray-400">{new Date(h.updatedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
