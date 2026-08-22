"use client";

import { useState } from "react";
import {
  approveApiKeyRequestAction,
  denyApiKeyRequestAction,
  issueApiKeyAction,
  revokeApiKeyAction,
  type AdminApiKeyDashboard,
} from "@/lib/actions/api-keys";
import { Button, Card, Field, inputClass, Badge } from "@/components/ui";
import { API_SCOPES, type ApiScope } from "@/lib/api-key-scopes";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/components/toast";
import { IconCopy, IconCheck } from "@/components/icons";

const SCOPE_LABELS: Record<string, string> = {
  "questionnaires:read": "questionnaires:read",
  "responses:read": "responses:read",
  "reports:read": "reports:read",
  "masters:read": "masters:read",
  "option-sets:read": "option-sets:read",
};

const STATUS_TONE: Record<string, "gray" | "green" | "amber" | "red"> = {
  ACTIVE: "green",
  REVOKED: "red",
  EXPIRED: "amber",
  PENDING: "amber",
  APPROVED: "green",
  DENIED: "red",
};

export function ApiKeysPanel({ dashboard }: { dashboard: AdminApiKeyDashboard }) {
  const toast = useToast();
  const [issueOpen, setIssueOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const [secretReveal, setSecretReveal] = useState<{ keyPrefix: string; secret: string } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCopySecret() {
    if (!secretReveal) return;
    const ok = await copyToClipboard(secretReveal.secret);
    if (ok) {
      setCopiedSecret(true);
      toast.success("API key copied", "Make sure to store it securely.");
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  }

  async function handleCopyPrefix(id: string, prefix: string) {
    const ok = await copyToClipboard(prefix);
    if (ok) {
      setCopiedKeyId(id);
      toast.success("Key prefix copied", prefix);
      setTimeout(() => setCopiedKeyId((cur) => (cur === id ? null : cur)), 2000);
    }
  }

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await issueApiKeyAction({ name, scopes });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSecretReveal({ keyPrefix: result.keyPrefix!, secret: result.secret! });
    setName("");
    setScopes([]);
    setIssueOpen(false);
  }

  async function handleApprove(requestId: string) {
    setBusy(true);
    const result = await approveApiKeyRequestAction(requestId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSecretReveal({ keyPrefix: result.keyPrefix!, secret: result.secret! });
  }

  async function handleDeny(requestId: string) {
    setBusy(true);
    const result = await denyApiKeyRequestAction(requestId);
    setBusy(false);
    if (result.error) setError(result.error);
  }

  async function handleRevoke(keyId: string) {
    if (!window.confirm("Revoke this API key? Existing integrations will stop working.")) return;
    setBusy(true);
    const result = await revokeApiKeyAction(keyId);
    setBusy(false);
    if (result.error) setError(result.error);
  }

  const pendingRequests = dashboard.requests.filter((r) => r.status === "PENDING");
  const canApprove = dashboard.canApproveRequests;

  return (
    <div className="space-y-8">
      {secretReveal && (
        <Card className="border-emerald-300 bg-emerald-50 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-emerald-800">Key issued — copy it now</h3>
            <Badge tone="green">shown once</Badge>
          </div>
          <p className="mt-2 text-xs text-emerald-700">
            This secret is shown only now. Store it securely; we only keep the hash.
          </p>
          <code className="mt-3 block break-all rounded-lg bg-white px-3 py-2 text-sm text-gray-800">
            {secretReveal.secret}
          </code>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              onClick={handleCopySecret}
            >
              {copiedSecret ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700">
                  <IconCheck size={14} />
                  Copied!
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <IconCopy size={14} />
                  Copy key
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSecretReveal(null);
                setCopiedSecret(false);
              }}
            >
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Pending requests — approval queue (admin-only; DEV does not see it) */}
      {canApprove && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Approval queue</h2>
            <Badge tone="amber">{pendingRequests.length} pending</Badge>
          </div>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-gray-500">No pending requests.</p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((r) => (
                <div key={r.id} className="flex items-start justify-between rounded-lg border border-gray-200 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {r.requesterName}
                      {r.organization && <span className="text-gray-500"> · {r.organization}</span>}
                    </p>
                    <p className="text-xs text-gray-500">{r.requesterEmail}</p>
                    <p className="mt-1 text-xs text-gray-600">{r.purpose}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(r.requestedScopes as string[]).map((s) => (
                        <Badge key={s} tone="indigo">{SCOPE_LABELS[s] ?? s}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" disabled={busy} onClick={() => handleDeny(r.id)}>
                      Deny
                    </Button>
                    <Button disabled={busy} onClick={() => handleApprove(r.id)}>
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Issue key directly */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Issue a key</h2>
          <Button variant="secondary" onClick={() => setIssueOpen((v) => !v)}>
            {issueOpen ? "Cancel" : "New key"}
          </Button>
        </div>
        {issueOpen && (
          <form onSubmit={handleIssue} className="space-y-4">
            <Field label="Key name" required>
              <input
                className={inputClass}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="BPS pipeline"
              />
            </Field>
            <Field label="Scopes" required>
              <div className="space-y-2">
                {API_SCOPES.map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={() =>
                        setScopes((prev) =>
                          prev.includes(scope)
                            ? prev.filter((s) => s !== scope)
                            : [...prev, scope]
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {SCOPE_LABELS[scope] ?? scope}
                  </label>
                ))}
              </div>
            </Field>
            <Button type="submit" disabled={busy || scopes.length === 0}>
              {busy ? "Creating…" : "Create key"}
            </Button>
          </form>
        )}
      </Card>

      {/* Key list */}
      <Card className="p-5">
        <h2 className="mb-4 text-lg font-bold">API keys</h2>
        {dashboard.keys.length === 0 ? (
          <p className="text-sm text-gray-500">No API keys yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Key</th>
                  <th className="py-2 pr-4">Scopes</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Expires</th>
                  <th className="py-2 pr-4">Last used</th>
                  <th className="py-2 pr-4">Requests</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.keys.map((k) => (
                  <tr key={k.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-900">{k.name}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs text-gray-500">{k.keyPrefix}…</code>
                        <button
                          type="button"
                          onClick={() => handleCopyPrefix(k.id, k.keyPrefix)}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-gray-900"
                          title="Copy key prefix"
                          aria-label={`Copy prefix for ${k.name}`}
                        >
                          {copiedKeyId === k.id ? (
                            <>
                              <IconCheck size={12} className="text-emerald-600" />
                              <span className="text-emerald-700">Copied</span>
                            </>
                          ) : (
                            <>
                              <IconCopy size={12} className="text-gray-400" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {(k.scopes as string[]).map((s) => (
                          <Badge key={s} tone="indigo">{SCOPE_LABELS[s] ?? s}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={STATUS_TONE[k.status] ?? "gray"}>{k.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">
                      {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "never"}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">{k.requestCount}</td>
                    <td className="py-2">
                      {k.status === "ACTIVE" && (
                        <Button variant="danger" disabled={busy} onClick={() => handleRevoke(k.id)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
