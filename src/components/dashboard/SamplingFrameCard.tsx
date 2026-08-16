"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadSamplingFrameAction,
  deleteSamplingFrameEntryAction,
} from "@/lib/actions/dashboard";
import { Badge, Button, Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { IconTrash } from "@/components/icons";

export interface SamplingFrameEntryRow {
  id: string;
  organizationName: string;
  contact: string;
  contactType: "EMAIL" | "PHONE";
  rowIndex: number;
}

interface ImportError {
  row: number;
  message: string;
}

/** Sampling-frame upload card (TKT-012): .xlsx import + editable entry list. */
export function SamplingFrameCard({
  questionnaireId,
  entries,
}: {
  questionnaireId: string;
  entries: SamplingFrameEntryRow[];
}) {
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [importErrors, setImportErrors] = useState<ImportError[] | null>(null);

  const upload = (formData: FormData) => {
    startTransition(async () => {
      setError(null);
      setImportErrors(null);
      setImported(null);
      const res = await uploadSamplingFrameAction(questionnaireId, formData);
      if (res.error) {
        setError(res.error);
        toast.error("Upload failed", res.error);
        return;
      }
      setImported(res.imported ?? 0);
      setImportErrors(res.errors ?? null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
      if ((res.imported ?? 0) > 0) toast.success("Sampling frame updated");
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await deleteSamplingFrameEntryAction({ id, questionnaireId });
      if (res.error) {
        setError(res.error);
        toast.error("Delete failed", res.error);
        return;
      }
      toast.success("Entry removed");
      router.refresh();
    });
  };

  return (
    <Card className="p-6">
      <h2 className="mb-1 font-semibold">Sampling frame (Excel)</h2>
      <p className="mb-3 text-xs text-gray-500">
        Upload the sampling frame of known respondents. Columns:{" "}
        <code className="text-indigo-700">organization_name</code>,{" "}
        <code className="text-indigo-700">contact</code> (email or phone). Email
        contacts receive unique links when you send invitations; phone contacts
        are flagged for other distribution.
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          upload(new FormData(e.currentTarget));
        }}
      >
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="text-sm"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Uploading…" : "Upload & replace frame"}
        </Button>
      </form>

      {imported !== null && (
        <p className="mt-3 text-sm">
          <span className="font-medium text-green-700">{imported} row(s) imported.</span>{" "}
          {importErrors && importErrors.length > 0 && (
            <span className="text-amber-700">
              {importErrors.length} row(s) skipped (see below).
            </span>
          )}
        </p>
      )}
      {importErrors && importErrors.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {importErrors.map((err, i) => (
            <li key={i}>{err.message}</li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
            No sampling-frame entries yet — upload an .xlsx file above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Organization</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-gray-400">{e.rowIndex + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {e.organizationName}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{e.contact}</td>
                  <td className="px-3 py-2">
                    <Badge tone={e.contactType === "EMAIL" ? "green" : "amber"}>
                      {e.contactType}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                      onClick={() => remove(e.id)}
                    >
                      <IconTrash size={13} />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
