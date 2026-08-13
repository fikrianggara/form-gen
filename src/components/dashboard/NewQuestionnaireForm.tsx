"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createQuestionnaireAction } from "@/lib/actions/dashboard";
import { Button, Card, Field, inputClass } from "@/components/ui";

export default function NewQuestionnaireForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">New questionnaire</h2>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          const fd = new FormData(e.currentTarget);
          const result = await createQuestionnaireAction({
            title: String(fd.get("title") ?? ""),
            slug: String(fd.get("slug") ?? ""),
            description: String(fd.get("description") ?? "") || undefined,
            acceptMultipleResponses: fd.get("multiple") === "on",
          });
          if (result?.error) {
            setError(result.error);
            setPending(false);
          } else {
            router.refresh();
          }
        }}
      >
        <Field label="Title" required>
          <input name="title" required className={inputClass} placeholder="e.g. Customer Feedback Survey" />
        </Field>
        <Field label="Slug (public URL)" required hint="Lowercase letters, numbers and hyphens. e.g. customer-feedback">
          <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" className={inputClass} placeholder="customer-feedback" />
        </Field>
        <Field label="Description">
          <textarea name="description" className={inputClass} rows={2} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="multiple" defaultChecked className="accent-indigo-600" />
          Allow multiple responses per visitor
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
