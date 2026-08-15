import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listResponses } from "@/services/response.service";
import { Badge, ProgressBar } from "@/components/ui";
import { ResponseActionsMenu } from "@/components/dashboard/ResponseActionsMenu";
import { IconDownload, IconChart, IconArrowLeft } from "@/components/icons";
import type { ResponseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<ResponseStatus, "gray" | "green" | "amber" | "indigo"> = {
  DRAFT: "gray",
  SUBMITTED: "green",
  EDITED: "amber",
  APPROVED: "indigo",
};

export default async function ResponsesPage({
  params,
}: {
  params: { id: string };
}) {
  const questionnaire = await db.questionnaire.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, slug: true },
  });
  if (!questionnaire) notFound();

  const responses = await listResponses(params.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Responses</h1>
          <p className="text-sm text-gray-500">
            {questionnaire.title} · <Link href={`/f/${questionnaire.slug}`} className="underline">/f/{questionnaire.slug}</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/questionnaires/${questionnaire.slug}/export?format=json`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <IconDownload size={15} />
            Export API
          </a>
          <a
            href={`/api/questionnaires/${questionnaire.slug}/export?format=xlsx`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <IconDownload size={15} />
            Export Excel
          </a>
          <Link
            href={`/dashboard/questionnaires/${questionnaire.id}/report`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <IconChart size={15} />
            Report
          </Link>
          <Link
            href={`/dashboard/questionnaires/${questionnaire.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <IconArrowLeft size={15} />
            Back to editor
          </Link>
        </div>
      </div>

      {responses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          No responses yet.
        </p>
      ) : (
        <div className="overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 first:rounded-tl-xl">Respondent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 w-48">Progress</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 last:rounded-tr-xl"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {responses.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{r.respondentLabel ?? "Anonymous"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><ProgressBar value={r.progress} /></div>
                      <span className="text-xs text-gray-500">{r.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.createdAt.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{r.updatedAt.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <ResponseActionsMenu
                      questionnaireId={params.id}
                      responseId={r.id}
                      respondentLabel={r.respondentLabel}
                      status={r.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
