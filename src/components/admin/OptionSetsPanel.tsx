"use client";

import { useMemo, useState, useTransition } from "react";
import { saveOptionSetAction, deleteOptionSetAction } from "@/lib/actions/dashboard";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";

export interface OptionSetRow {
  id: string;
  name: string;
  source: "STATIC" | "EXTERNAL_API";
  apiUrl: string | null;
  apiMethod: string | null;
  apiHeaders: Record<string, string> | null;
  itemsPath: string | null;
  options: Array<{ label: string; value: string }>;
  version: number;
}

export interface OptionSetVersionRow {
  id: string;
  name: string;
  version: number;
  isLatest: boolean;
  updatedAt: string;
  optionCount: number;
}

interface TestState {
  testingId: string | null;
  result: { ok: boolean; message: string } | null;
}

export function OptionSetsPanel({
  optionSets,
  history,
}: {
  optionSets: OptionSetRow[];
  history: OptionSetVersionRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OptionSetRow | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ testingId: null, result: null });

  const historyByName = useMemo(() => {
    const map = new Map<string, OptionSetVersionRow[]>();
    for (const h of history) {
      const list = map.get(h.name) ?? [];
      list.push(h);
      map.set(h.name, list);
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

  const runTest = async (set: OptionSetRow) => {
    setTest({ testingId: set.id, result: null });
    try {
      const res = await fetch(`/api/option-sets/${set.id}/options?fresh=1`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setTest({
          testingId: null,
          result: { ok: false, message: body?.error?.message ?? `HTTP ${res.status}` },
        });
        return;
      }
      const data = await res.json();
      const items = data.items as Array<{ label: string; value: string }>;
      const preview = items.slice(0, 3).map((i) => i.label).join(", ");
      setTest({
        testingId: null,
        result: {
          ok: true,
          message: `OK — ${items.length} options${items.length ? ` (${preview}${items.length > 3 ? ", …" : ""})` : ""}`,
        },
      });
    } catch {
      setTest({ testingId: null, result: { ok: false, message: "Network error while testing" } });
    }
  };

  const form = editing;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">{form ? `Edit ${form.name} (v${form.version})` : "New option set"}</h2>
        {form && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Saving creates a new immutable version (v{form.version + 1}). Questionnaires using the
            old version keep their options; re-point masters to this version to pick up changes.
          </p>
        )}
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const source = String(fd.get("source")) as "STATIC" | "EXTERNAL_API";
            const optionsText = String(fd.get("options") ?? "");
            const options = optionsText
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [label, value] = line.split(/[=|,]/).map((s) => s.trim());
                return { label: label ?? value ?? line, value: value ?? label ?? line };
              });
            run(() =>
              saveOptionSetAction({
                id: form?.id,
                name: String(fd.get("name") ?? ""),
                source,
                apiUrl: String(fd.get("apiUrl") ?? "") || undefined,
                apiMethod: String(fd.get("apiMethod") ?? "") || undefined,
                apiHeaders: String(fd.get("apiHeaders") ?? "") || undefined,
                itemsPath: String(fd.get("itemsPath") ?? "") || undefined,
                options,
              })
            );
          }}
        >
          <Field label="Name" required hint="Cannot be changed after creation">
            <input name="name" required disabled={!!form} defaultValue={form?.name} className={inputClass} />
          </Field>
          <Field label="Source" required>
            <select name="source" required defaultValue={form?.source ?? "STATIC"} className={inputClass}>
              <option value="STATIC">Static (stored options)</option>
              <option value="EXTERNAL_API">External API</option>
            </select>
          </Field>
          <Field label="API URL" hint="Required when source is External API">
            <input name="apiUrl" defaultValue={form?.apiUrl ?? ""} className={inputClass} placeholder="https://api.example.com/items" />
          </Field>
          <Field label="API method">
            <select name="apiMethod" defaultValue={form?.apiMethod ?? "GET"} className={inputClass}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </Field>
          <Field label="Items path" hint='JSON pointer, e.g. "data.items" (empty = root array)'>
            <input name="itemsPath" defaultValue={form?.itemsPath ?? ""} className={inputClass} placeholder="data.items" />
          </Field>
          <Field label="API headers (JSON)" hint='e.g. {"Authorization":"Bearer xyz"}'>
            <input name="apiHeaders" defaultValue={form?.apiHeaders ? JSON.stringify(form.apiHeaders) : ""} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Static options" hint="One per line as label=value (or label,value)">
              <textarea
                name="options"
                rows={5}
                className={inputClass}
                defaultValue={form?.options.map((o) => `${o.label}=${o.value}`).join("\n") ?? ""}
              />
            </Field>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {form ? `Save as v${form.version + 1}` : "Create option set"}
            </Button>
            {form && (
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3">Options</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {optionSets.map((s) => (
              <OptionSetRowView
                key={s.id}
                set={s}
                history={historyByName.get(s.name) ?? []}
                historyOpen={openHistory === s.name}
                onToggleHistory={() =>
                  setOpenHistory((cur) => (cur === s.name ? null : s.name))
                }
                onEdit={() => setEditing(s)}
                onDelete={() => {
                  if (confirm(`Delete option set ${s.name} (all versions)?`)) {
                    run(() => deleteOptionSetAction({ id: s.id }));
                  }
                }}
                testing={test.testingId === s.id}
                testResult={test.result}
                onTest={() => void runTest(s)}
              />
            ))}
          </tbody>
        </table>
        {optionSets.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-400">No option sets yet.</p>
        )}
      </div>
    </div>
  );
}

function OptionSetRowView({
  set,
  history,
  historyOpen,
  onToggleHistory,
  onEdit,
  onDelete,
  testing,
  testResult,
  onTest,
}: {
  set: OptionSetRow;
  history: OptionSetVersionRow[];
  historyOpen: boolean;
  onToggleHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onTest: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3 font-medium text-gray-900">{set.name}</td>
        <td className="px-4 py-3">
          <Badge tone={set.source === "STATIC" ? "gray" : "indigo"}>{set.source}</Badge>
        </td>
        <td className="max-w-[220px] truncate px-4 py-3 text-xs text-gray-500">
          {set.source === "EXTERNAL_API" ? set.apiUrl : "—"}
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {set.source === "STATIC" ? `${set.options.length} options` : `path: ${set.itemsPath ?? "(root)"}`}
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={onToggleHistory}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
            title="View version history"
          >
            v{set.version} {history.length > 1 ? `(${history.length})` : ""} ▾
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3 text-xs">
            {set.source === "EXTERNAL_API" && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                onClick={onTest}
                disabled={testing}
              >
                {testing ? "Testing…" : "⏻ Test"}
              </button>
            )}
            <button className="text-indigo-600 hover:underline" onClick={onEdit}>
              Edit (v{set.version + 1})
            </button>
            <button className="text-red-600 hover:underline" onClick={onDelete}>
              Delete
            </button>
          </div>
        </td>
      </tr>
      {(testResult || testing) && set.source === "EXTERNAL_API" && (
        <tr className="bg-indigo-50/40">
          <td colSpan={6} className="px-6 py-2">
            {testing ? (
              <span className="text-xs text-indigo-600">Fetching {set.apiUrl} …</span>
            ) : testResult ? (
              <span
                className={`text-xs ${testResult.ok ? "text-emerald-700" : "text-red-700"}`}
              >
                {testResult.ok ? "✓ " : "✗ "}
                {testResult.message}
              </span>
            ) : null}
          </td>
        </tr>
      )}
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
                  <span className="flex-1">
                    {h.optionCount} options · {h.isLatest ? "latest" : "archived"}
                  </span>
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
