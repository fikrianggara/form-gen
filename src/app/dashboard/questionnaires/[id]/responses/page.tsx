import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listResponses } from "@/services/response.service";
import { Badge, ProgressBar } from "@/components/ui";

export const dynamic = "force-dynamic";

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
        <Link
          href={`/dashboard/questionnaires/${questionnaire.id}/edit`}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          ← Back to editor
        </Link>
      </div>

      {responses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          No responses yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Respondent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 w-48">Progress</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {responses.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{r.respondentLabel ?? "Anonymous"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={r.status === "COMPLETED" ? "green" : "gray"}>{r.status}</Badge>
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
                    <Link
                      href={`/dashboard/questionnaires/${params.id}/responses/${r.id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      View
                    </Link>
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
