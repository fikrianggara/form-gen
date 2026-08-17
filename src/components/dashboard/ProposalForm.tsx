"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProposalAction } from "@/lib/actions/proposals";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";

function parseOutline(text: string): Array<{ title: string; type: string }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, type = "TEXT"] = line.split("|").map((s) => s.trim());
      return { title, type: type.toUpperCase() };
    });
}

export function ProposalForm({
  organizations,
  defaultOrganizationId,
}: {
  organizations: Array<{ id: string; name: string }>;
  defaultOrganizationId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const outlineText = String(fd.get("outline") ?? "");
    startTransition(async () => {
      setError(null);
      const res = await saveProposalAction({
        title: String(fd.get("title") ?? ""),
        purpose: String(fd.get("purpose") ?? "") || null,
        target: String(fd.get("target") ?? "") || null,
        outline: outlineText ? parseOutline(outlineText) : null,
        verifyEmail: String(fd.get("verifyEmail") ?? "") || null,
        organizationId: String(fd.get("organizationId") ?? "") || defaultOrganizationId,
      });
      if (res.error) {
        setError(res.error);
        toast.error("Could not save proposal", res.error);
      } else {
        toast.success("Proposal saved", "It stays a draft until you submit it.");
        router.push(`/dashboard/proposals/${res.id}`);
        router.refresh();
      }
    });
  };

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">New survey proposal</h2>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Title" required>
          <input name="title" required className={inputClass} placeholder="e.g. Employee engagement survey" />
        </Field>
        <Field label="Purpose">
          <textarea name="purpose" className={inputClass} rows={2} placeholder="Why run this survey?" />
        </Field>
        <Field label="Target">
          <input name="target" className={inputClass} placeholder="Who will respond? e.g. All permanent staff" />
        </Field>
        <Field
          label="Question outline"
          hint="One per line: Title | TYPE (TEXT, RATING, RADIO…). TYPE defaults to TEXT."
        >
          <textarea
            name="outline"
            className={inputClass}
            rows={4}
            placeholder={"How engaged are you? | RATING\nDepartment | SELECT"}
          />
        </Field>
        <Field label="Verification email (optional)" hint="Send a verification link that moves the proposal forward once opened.">
          <input name="verifyEmail" type="email" className={inputClass} placeholder="approver@example.com" />
        </Field>
        {organizations.length > 1 && (
          <Field label="Organization">
            <select name="organizationId" className={inputClass} defaultValue={defaultOrganizationId ?? ""}>
              <option value="">{defaultOrganizationId ? "Your organization" : "Select…"}</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
