"use client";

import { useState } from "react";
import { submitApiKeyRequestAction } from "@/lib/actions/api-keys";
import { Button, Card, Field, inputClass, Badge } from "@/components/ui";
import { API_SCOPES, type ApiScope } from "@/lib/api-key-scopes";

const SCOPE_LABELS: Record<string, string> = {
  "questionnaires:read": "Read questionnaires",
  "responses:read": "Read responses",
  "reports:read": "Read reports",
  "masters:read": "Read question masters",
  "option-sets:read": "Read option sets",
};

export function ApiAccessRequestForm() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    requesterName: "",
    requesterEmail: "",
    organization: "",
    purpose: "",
  });
  const [scopes, setScopes] = useState<ApiScope[]>(["questionnaires:read"]);

  function toggleScope(scope: ApiScope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await submitApiKeyRequestAction(
      { ...form, requestedScopes: scopes },
      // Best-effort IP for rate limiting (server sets x-forwarded-for in prod).
      null
    );
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <h2 className="text-xl font-bold text-emerald-700">Request submitted</h2>
        <p className="mt-3 text-sm text-gray-600">
          Your request has been queued for review. An administrator will
          approve or deny it; if approved, the API key is issued to you.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-xl p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Request API access</h2>
          <Badge tone="amber">Pending admin approval</Badge>
        </div>

        <Field label="Your name" required>
          <input
            className={inputClass}
            required
            value={form.requesterName}
            onChange={(e) => setForm((f) => ({ ...f, requesterName: e.target.value }))}
          />
        </Field>

        <Field label="Work email" required hint="Where we will send the approved key.">
          <input
            className={inputClass}
            type="email"
            required
            value={form.requesterEmail}
            onChange={(e) => setForm((f) => ({ ...f, requesterEmail: e.target.value }))}
          />
        </Field>

        <Field label="Organization / institution">
          <input
            className={inputClass}
            value={form.organization}
            onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
          />
        </Field>

        <Field label="Purpose of access" required hint="What will the API be used for?">
          <textarea
            className={inputClass}
            required
            rows={3}
            value={form.purpose}
            onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
          />
        </Field>

        <Field label="Requested capabilities" required>
          <div className="space-y-2">
            {API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                {SCOPE_LABELS[scope] ?? scope}
                <code className="text-xs text-gray-400">{scope}</code>
              </label>
            ))}
          </div>
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <Button type="submit" disabled={pending || scopes.length === 0}>
          {pending ? "Submitting…" : "Submit request"}
        </Button>
      </form>
    </Card>
  );
}
